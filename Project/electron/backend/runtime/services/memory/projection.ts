import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { conversationStore, memoryStore, runStore, threadStore } from '@/app/backend/persistence/stores';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import type { MemoryRecord } from '@/app/backend/persistence/types';
import { memoryStates, type EntityId } from '@/app/backend/runtime/contracts';
import type {
    ApplyMemoryEditProposalInput,
    ApplyMemoryEditProposalResult,
    MemoryEditProposal,
    MemoryProjectionContextInput,
    MemoryProjectionPaths,
    MemoryProjectionStatusResult,
    MemoryProjectionTarget,
    MemoryScanProjectionEditsResult,
    ProjectedMemoryRecord,
} from '@/app/backend/runtime/contracts';
import { readEnumValue } from '@/app/backend/runtime/contracts/parsers/helpers';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import { memoryService } from '@/app/backend/runtime/services/memory/service';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';
import { appLog } from '@/app/main/logging';

interface ParsedFrontmatter {
    attributes: Record<string, unknown>;
    bodyMarkdown: string;
}

interface ResolvedProjectionContext {
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    includeBroaderScopes: boolean;
}

interface CandidateProjection {
    memory: MemoryRecord;
    projectionTarget: MemoryProjectionTarget;
    absolutePath: string;
    relativePath: string;
}

interface ScannedProjection {
    projected: ProjectedMemoryRecord;
    expectedContent: string;
    currentContent?: string;
}

interface ParsedMemoryProposal {
    title: string;
    bodyMarkdown: string;
    summaryText?: string;
    metadata: Record<string, unknown>;
    proposedState: MemoryRecord['state'];
}

function normalizeContent(content: string): string {
    return content.replace(/\r\n?/g, '\n');
}

function hashContent(content: string): string {
    return createHash('sha256').update(normalizeContent(content)).digest('hex');
}

function stripQuotes(value: string): string {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function parseScalar(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return '';
    }
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
        return JSON.parse(trimmed);
    }
    if (trimmed === 'true') {
        return true;
    }
    if (trimmed === 'false') {
        return false;
    }
    if (trimmed === 'null') {
        return null;
    }
    if (/^-?\d+$/.test(trimmed)) {
        return Number.parseInt(trimmed, 10);
    }

    return stripQuotes(trimmed);
}

function parseFrontmatter(markdown: string): ParsedFrontmatter {
    const normalized = normalizeContent(markdown);
    if (!normalized.startsWith('---\n')) {
        throw new Error('Projected memory file must start with frontmatter.');
    }

    const closingIndex = normalized.indexOf('\n---\n', 4);
    if (closingIndex < 0) {
        throw new Error('Projected memory file is missing a closing frontmatter delimiter.');
    }

    const headerLines = normalized.slice(4, closingIndex).split('\n');
    const bodyMarkdown = normalized.slice(closingIndex + '\n---\n'.length).trim();
    const attributes: Record<string, unknown> = {};

    for (const line of headerLines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }

        const separatorIndex = trimmed.indexOf(':');
        if (separatorIndex <= 0) {
            throw new Error(`Invalid frontmatter line: "${trimmed}".`);
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        attributes[key] = parseScalar(rawValue);
    }

    return {
        attributes,
        bodyMarkdown,
    };
}

function serializeFrontmatterValue(value: unknown): string {
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (value === null) {
        return 'null';
    }

    return JSON.stringify(value);
}

function toProjectionFileName(memory: MemoryRecord): string {
    return `${memory.scopeKind}--${memory.id}.md`;
}

function renderProjectedMemoryFile(memory: MemoryRecord): string {
    const frontmatterEntries: Array<[string, unknown]> = [
        ['id', memory.id],
        ['memoryType', memory.memoryType],
        ['scopeKind', memory.scopeKind],
        ['state', memory.state],
        ['title', memory.title],
        ['metadata', memory.metadata],
    ];

    if (memory.summaryText) {
        frontmatterEntries.push(['summaryText', memory.summaryText]);
    }
    if (memory.workspaceFingerprint) {
        frontmatterEntries.push(['workspaceFingerprint', memory.workspaceFingerprint]);
    }
    if (memory.threadId) {
        frontmatterEntries.push(['threadId', memory.threadId]);
    }
    if (memory.runId) {
        frontmatterEntries.push(['runId', memory.runId]);
    }

    const header = frontmatterEntries.map(([key, value]) => `${key}: ${serializeFrontmatterValue(value)}`).join('\n');

    return normalizeContent(`---\n${header}\n---\n${memory.bodyMarkdown.trim()}\n`);
}

function readRequiredString(attributes: Record<string, unknown>, field: string): string {
    const value = attributes[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Invalid "${field}": expected non-empty string.`);
    }

    return value.trim();
}

function readOptionalString(attributes: Record<string, unknown>, field: string): string | undefined {
    const value = attributes[field];
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error(`Invalid "${field}": expected string.`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function readObject(attributes: Record<string, unknown>, field: string): Record<string, unknown> {
    const value = attributes[field];
    if (value === undefined) {
        return {};
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid "${field}": expected object.`);
    }

    return Object.fromEntries(Object.entries(value));
}

function readExactValue(attributes: Record<string, unknown>, field: string, expected: string | undefined): void {
    const value = readOptionalString(attributes, field);
    if ((expected ?? undefined) !== value) {
        throw new Error(`Projected memory "${field}" cannot be changed from the canonical value.`);
    }
}

export function readParsedState(attributes: Record<string, unknown>): MemoryRecord['state'] {
    return readEnumValue(attributes['state'], 'state', memoryStates);
}

function parseMemoryProposal(memory: MemoryRecord, content: string): ParsedMemoryProposal {
    const parsed = parseFrontmatter(content);
    const attributes = parsed.attributes;
    const memoryId = readRequiredString(attributes, 'id');
    if (memoryId !== memory.id) {
        throw new Error('Projected memory "id" cannot be changed.');
    }

    const memoryType = readRequiredString(attributes, 'memoryType');
    if (memoryType !== memory.memoryType) {
        throw new Error('Projected memory "memoryType" cannot be changed.');
    }

    const scopeKind = readRequiredString(attributes, 'scopeKind');
    if (scopeKind !== memory.scopeKind) {
        throw new Error('Projected memory "scopeKind" cannot be changed.');
    }

    readExactValue(attributes, 'workspaceFingerprint', memory.workspaceFingerprint);
    readExactValue(attributes, 'threadId', memory.threadId);
    readExactValue(attributes, 'runId', memory.runId);

    const title = readRequiredString(attributes, 'title');
    const bodyMarkdown = parsed.bodyMarkdown.trim();
    const summaryText = readOptionalString(attributes, 'summaryText');
    if (bodyMarkdown.length === 0) {
        throw new Error('Projected memory body cannot be empty.');
    }

    return {
        title,
        bodyMarkdown,
        ...(summaryText ? { summaryText } : {}),
        metadata: readObject(attributes, 'metadata'),
        proposedState: readParsedState(attributes),
    };
}

function selectProjectionTarget(
    memory: MemoryRecord,
    paths: MemoryProjectionPaths,
    workspaceFingerprint?: string
): MemoryProjectionTarget {
    if (
        memory.scopeKind !== 'global' &&
        memory.workspaceFingerprint &&
        paths.workspaceMemoryRoot &&
        workspaceFingerprint === memory.workspaceFingerprint
    ) {
        return 'workspace';
    }

    return 'global';
}

function toCandidateProjectionForTarget(
    memory: MemoryRecord,
    paths: MemoryProjectionPaths,
    projectionTarget: MemoryProjectionTarget
): CandidateProjection {
    const rootPath = projectionTarget === 'workspace' ? paths.workspaceMemoryRoot : paths.globalMemoryRoot;
    if (!rootPath) {
        throw new Error('Workspace-scoped memory projection requires a workspace memory root.');
    }

    const relativePath = path.join(memory.memoryType, toProjectionFileName(memory));
    return {
        memory,
        projectionTarget,
        absolutePath: path.join(rootPath, relativePath),
        relativePath: relativePath.replace(/\\/g, '/'),
    };
}

function toCandidateProjection(
    memory: MemoryRecord,
    paths: MemoryProjectionPaths,
    workspaceFingerprint?: string
): CandidateProjection {
    const projectionTarget = selectProjectionTarget(memory, paths, workspaceFingerprint);
    return toCandidateProjectionForTarget(memory, paths, projectionTarget);
}

async function writeProjectedMemoryFile(candidate: CandidateProjection): Promise<void> {
    await mkdir(path.dirname(candidate.absolutePath), { recursive: true });
    await writeFile(candidate.absolutePath, renderProjectedMemoryFile(candidate.memory), 'utf8');
}

async function scanProjectedMemory(candidate: CandidateProjection): Promise<ScannedProjection> {
    const expectedContent = renderProjectedMemoryFile(candidate.memory);

    try {
        const [fileStats, currentContent] = await Promise.all([
            stat(candidate.absolutePath),
            readFile(candidate.absolutePath, 'utf8'),
        ]);
        const normalizedCurrentContent = normalizeContent(currentContent);
        const observedContentHash = hashContent(normalizedCurrentContent);

        if (normalizedCurrentContent === expectedContent) {
            return {
                projected: {
                    memory: candidate.memory,
                    projectionTarget: candidate.projectionTarget,
                    absolutePath: candidate.absolutePath,
                    relativePath: candidate.relativePath,
                    syncState: 'in_sync',
                    fileExists: true,
                    fileUpdatedAt: fileStats.mtime.toISOString(),
                    observedContentHash,
                },
                expectedContent,
                currentContent: normalizedCurrentContent,
            };
        }

        try {
            parseMemoryProposal(candidate.memory, normalizedCurrentContent);
            return {
                projected: {
                    memory: candidate.memory,
                    projectionTarget: candidate.projectionTarget,
                    absolutePath: candidate.absolutePath,
                    relativePath: candidate.relativePath,
                    syncState: 'edited',
                    fileExists: true,
                    fileUpdatedAt: fileStats.mtime.toISOString(),
                    observedContentHash,
                },
                expectedContent,
                currentContent: normalizedCurrentContent,
            };
        } catch (error) {
            return {
                projected: {
                    memory: candidate.memory,
                    projectionTarget: candidate.projectionTarget,
                    absolutePath: candidate.absolutePath,
                    relativePath: candidate.relativePath,
                    syncState: 'parse_error',
                    fileExists: true,
                    fileUpdatedAt: fileStats.mtime.toISOString(),
                    observedContentHash,
                    parseError: error instanceof Error ? error.message : 'Projected memory file could not be parsed.',
                },
                expectedContent,
                currentContent: normalizedCurrentContent,
            };
        }
    } catch {
        return {
            projected: {
                memory: candidate.memory,
                projectionTarget: candidate.projectionTarget,
                absolutePath: candidate.absolutePath,
                relativePath: candidate.relativePath,
                syncState: 'not_projected',
                fileExists: false,
            },
            expectedContent,
        };
    }
}

export async function resolveMemoryProjectionPaths(input: {
    profileId: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
}): Promise<MemoryProjectionPaths> {
    const overrideMemoryRoot = process.env['NEONCONDUCTOR_GLOBAL_MEMORY_ROOT']?.trim();
    const globalMemoryRoot =
        overrideMemoryRoot && path.isAbsolute(overrideMemoryRoot)
            ? overrideMemoryRoot
            : path.join(os.homedir(), '.neonconductor', 'memory');

    if (!input.workspaceFingerprint) {
        return {
            globalMemoryRoot,
        };
    }

    const workspaceRoot = await workspaceContextService.resolveExplicit({
        profileId: input.profileId,
        workspaceFingerprint: input.workspaceFingerprint,
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
    });
    return {
        globalMemoryRoot,
        ...(workspaceRoot.kind === 'workspace' || workspaceRoot.kind === 'sandbox'
            ? {
                  workspaceMemoryRoot: path.join(
                      workspaceRoot.kind === 'sandbox'
                          ? workspaceRoot.baseWorkspace.absolutePath
                          : workspaceRoot.absolutePath,
                      '.neonconductor',
                      'memory'
                  ),
              }
            : {}),
    };
}

async function resolveProjectionContext(
    input: MemoryProjectionContextInput
): Promise<OperationalResult<ResolvedProjectionContext>> {
    const includeBroaderScopes = input.includeBroaderScopes ?? true;

    if (input.runId) {
        const run = await runStore.getById(input.runId);
        if (!run || run.profileId !== input.profileId) {
            return errOp('not_found', `Run "${input.runId}" was not found.`);
        }

        const sessionThread = await threadStore.getBySessionId(input.profileId, run.sessionId);
        if (!sessionThread) {
            return errOp('thread_not_found', `Session thread for run "${input.runId}" was not found.`);
        }

        const parsedThreadId = parseEntityId(sessionThread.thread.id, 'threads.id', 'thr');
        if (input.threadId && input.threadId !== parsedThreadId) {
            return errOp('invalid_input', 'Run projection context thread does not match the selected run.');
        }
        if (input.workspaceFingerprint && input.workspaceFingerprint !== sessionThread.workspaceFingerprint) {
            return errOp('invalid_input', 'Run projection context workspace does not match the selected run.');
        }

        return okOp({
            ...(sessionThread.workspaceFingerprint ? { workspaceFingerprint: sessionThread.workspaceFingerprint } : {}),
            threadId: parsedThreadId,
            runId: input.runId,
            includeBroaderScopes,
        });
    }

    if (input.threadId) {
        const thread = await threadStore.getById(input.profileId, input.threadId);
        if (!thread) {
            return errOp('thread_not_found', `Thread "${input.threadId}" was not found.`);
        }

        const conversation = await conversationStore.getBucketById(input.profileId, thread.conversationId);
        if (!conversation) {
            return errOp('conversation_not_found', `Conversation "${thread.conversationId}" was not found.`);
        }

        const derivedWorkspaceFingerprint =
            conversation.scope === 'workspace' ? conversation.workspaceFingerprint : undefined;
        if (input.workspaceFingerprint && input.workspaceFingerprint !== derivedWorkspaceFingerprint) {
            return errOp('invalid_input', 'Thread projection context workspace does not match the selected thread.');
        }

        return okOp({
            ...(derivedWorkspaceFingerprint ? { workspaceFingerprint: derivedWorkspaceFingerprint } : {}),
            threadId: input.threadId,
            includeBroaderScopes,
        });
    }

    return okOp({
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        includeBroaderScopes,
    });
}

function isMemoryRelevant(memory: MemoryRecord, context: ResolvedProjectionContext): boolean {
    if (context.runId) {
        if (!context.includeBroaderScopes) {
            return memory.scopeKind === 'run' && memory.runId === context.runId;
        }

        return (
            memory.scopeKind === 'global' ||
            (memory.scopeKind === 'workspace' && memory.workspaceFingerprint === context.workspaceFingerprint) ||
            (memory.scopeKind === 'thread' && memory.threadId === context.threadId) ||
            (memory.scopeKind === 'run' && memory.runId === context.runId)
        );
    }

    if (context.threadId) {
        if (!context.includeBroaderScopes) {
            return memory.scopeKind === 'thread' && memory.threadId === context.threadId;
        }

        return (
            memory.scopeKind === 'global' ||
            (memory.scopeKind === 'workspace' && memory.workspaceFingerprint === context.workspaceFingerprint) ||
            (memory.scopeKind === 'thread' && memory.threadId === context.threadId)
        );
    }

    if (context.workspaceFingerprint) {
        if (!context.includeBroaderScopes) {
            return memory.scopeKind === 'workspace' && memory.workspaceFingerprint === context.workspaceFingerprint;
        }

        return (
            memory.scopeKind === 'global' ||
            (memory.scopeKind === 'workspace' && memory.workspaceFingerprint === context.workspaceFingerprint)
        );
    }

    return memory.scopeKind === 'global';
}

function sortProjectedMemories(left: MemoryRecord, right: MemoryRecord): number {
    if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
    }

    return right.id.localeCompare(left.id);
}

class MemoryProjectionService {
    private async loadRelevantProjections(
        input: MemoryProjectionContextInput
    ): Promise<OperationalResult<{ paths: MemoryProjectionPaths; scanned: ScannedProjection[] }>> {
        const resolvedContext = await resolveProjectionContext(input);
        if (resolvedContext.isErr()) {
            return errOp(resolvedContext.error.code, resolvedContext.error.message, {
                ...(resolvedContext.error.details ? { details: resolvedContext.error.details } : {}),
            });
        }

        const [paths, allMemories] = await Promise.all([
            resolveMemoryProjectionPaths({
                profileId: input.profileId,
                ...(resolvedContext.value.workspaceFingerprint
                    ? { workspaceFingerprint: resolvedContext.value.workspaceFingerprint }
                    : {}),
                ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
            }),
            memoryStore.listByProfile({
                profileId: input.profileId,
            }),
        ]);

        const relevantMemories = allMemories
            .filter((memory) => isMemoryRelevant(memory, resolvedContext.value))
            .sort(sortProjectedMemories);
        const derivedSummariesResult = await advancedMemoryDerivationService.getDerivedSummaries(
            input.profileId,
            relevantMemories.map((memory) => memory.id)
        );
        if (derivedSummariesResult.isErr()) {
            appLog.warn({
                tag: 'memory-derived',
                message:
                    'Advanced memory summaries failed during projection loading; continuing without derived metadata.',
                profileId: input.profileId,
                errorCode: derivedSummariesResult.error.code,
                errorMessage: derivedSummariesResult.error.message,
            });
        }

        const scanned = await Promise.all(
            relevantMemories.map((memory) =>
                scanProjectedMemory(toCandidateProjection(memory, paths, resolvedContext.value.workspaceFingerprint))
            )
        );

        return okOp({
            paths,
            scanned: scanned.map((item) => {
                const derivedSummary = derivedSummariesResult.isOk()
                    ? derivedSummariesResult.value.get(item.projected.memory.id)
                    : undefined;

                return {
                    ...item,
                    projected: derivedSummary ? { ...item.projected, derivedSummary } : item.projected,
                };
            }),
        });
    }

    async listProjectionStatus(
        input: MemoryProjectionContextInput
    ): Promise<OperationalResult<MemoryProjectionStatusResult>> {
        const loaded = await this.loadRelevantProjections(input);
        if (loaded.isErr()) {
            return errOp(loaded.error.code, loaded.error.message, {
                ...(loaded.error.details ? { details: loaded.error.details } : {}),
            });
        }

        return okOp({
            paths: loaded.value.paths,
            projectedMemories: loaded.value.scanned.map((item) => item.projected),
        });
    }

    async syncProjection(
        input: MemoryProjectionContextInput
    ): Promise<OperationalResult<MemoryProjectionStatusResult>> {
        const loaded = await this.loadRelevantProjections(input);
        if (loaded.isErr()) {
            return errOp(loaded.error.code, loaded.error.message, {
                ...(loaded.error.details ? { details: loaded.error.details } : {}),
            });
        }

        await Promise.all(
            loaded.value.scanned.map((item) => {
                if (item.projected.syncState === 'edited' || item.projected.syncState === 'parse_error') {
                    return Promise.resolve();
                }

                return writeProjectedMemoryFile(
                    toCandidateProjectionForTarget(
                        item.projected.memory,
                        loaded.value.paths,
                        item.projected.projectionTarget
                    )
                );
            })
        );

        const refreshed = await this.listProjectionStatus(input);
        if (refreshed.isErr()) {
            return refreshed;
        }

        return okOp(refreshed.value);
    }

    async scanProjectionEdits(
        input: MemoryProjectionContextInput
    ): Promise<OperationalResult<MemoryScanProjectionEditsResult>> {
        const loaded = await this.loadRelevantProjections(input);
        if (loaded.isErr()) {
            return errOp(loaded.error.code, loaded.error.message, {
                ...(loaded.error.details ? { details: loaded.error.details } : {}),
            });
        }

        const proposals: MemoryEditProposal[] = [];
        const parseErrors: ProjectedMemoryRecord[] = [];

        for (const item of loaded.value.scanned) {
            if (item.projected.syncState === 'parse_error') {
                parseErrors.push(item.projected);
                continue;
            }
            if (item.projected.syncState !== 'edited' || !item.currentContent || !item.projected.fileUpdatedAt) {
                continue;
            }

            try {
                const parsedProposal = parseMemoryProposal(item.projected.memory, item.currentContent);
                proposals.push({
                    memory: item.projected.memory,
                    projectionTarget: item.projected.projectionTarget,
                    absolutePath: item.projected.absolutePath,
                    relativePath: item.projected.relativePath,
                    observedContentHash: item.projected.observedContentHash ?? hashContent(item.currentContent),
                    fileUpdatedAt: item.projected.fileUpdatedAt,
                    reviewAction:
                        parsedProposal.proposedState === 'disabled'
                            ? 'disable'
                            : parsedProposal.proposedState === 'superseded'
                              ? 'supersede'
                              : 'update',
                    proposedState: parsedProposal.proposedState,
                    proposedTitle: parsedProposal.title,
                    proposedBodyMarkdown: parsedProposal.bodyMarkdown,
                    ...(parsedProposal.summaryText ? { proposedSummaryText: parsedProposal.summaryText } : {}),
                    proposedMetadata: parsedProposal.metadata,
                });
            } catch (error) {
                parseErrors.push({
                    ...item.projected,
                    syncState: 'parse_error',
                    parseError: error instanceof Error ? error.message : 'Projected memory file could not be parsed.',
                });
            }
        }

        return okOp({
            paths: loaded.value.paths,
            proposals,
            parseErrors,
        });
    }

    async applyProjectionEditProposal(
        input: ApplyMemoryEditProposalInput
    ): Promise<OperationalResult<ApplyMemoryEditProposalResult>> {
        const scanned = await this.scanProjectionEdits(input);
        if (scanned.isErr()) {
            return errOp(scanned.error.code, scanned.error.message, {
                ...(scanned.error.details ? { details: scanned.error.details } : {}),
            });
        }

        const proposal = scanned.value.proposals.find((candidate) => candidate.memory.id === input.memoryId);
        if (!proposal) {
            return errOp('not_found', `Edited projection for memory "${input.memoryId}" was not found.`);
        }
        if (proposal.observedContentHash !== input.observedContentHash) {
            return errOp(
                'invalid_input',
                'Edited projection changed after it was reviewed. Scan again before applying.'
            );
        }

        if (input.decision === 'reject') {
            await writeProjectedMemoryFile(
                toCandidateProjectionForTarget(proposal.memory, scanned.value.paths, proposal.projectionTarget)
            );
            const refreshed = await scanProjectedMemory(
                toCandidateProjectionForTarget(proposal.memory, scanned.value.paths, proposal.projectionTarget)
            );
            return okOp({
                decision: 'reject',
                memory: proposal.memory,
                projection: refreshed.projected,
            });
        }

        if (proposal.reviewAction === 'update') {
            const updated = await memoryService.updateMemory({
                profileId: input.profileId,
                memoryId: input.memoryId,
                title: proposal.proposedTitle,
                bodyMarkdown: proposal.proposedBodyMarkdown,
                ...(proposal.proposedSummaryText ? { summaryText: proposal.proposedSummaryText } : {}),
                metadata: proposal.proposedMetadata,
            });
            if (updated.isErr()) {
                return errOp(updated.error.code, updated.error.message, {
                    ...(updated.error.details ? { details: updated.error.details } : {}),
                });
            }

            await writeProjectedMemoryFile(
                toCandidateProjectionForTarget(updated.value, scanned.value.paths, proposal.projectionTarget)
            );
            const refreshed = await scanProjectedMemory(
                toCandidateProjectionForTarget(updated.value, scanned.value.paths, proposal.projectionTarget)
            );
            return okOp({
                decision: 'accept',
                appliedAction: 'update',
                memory: updated.value,
                projection: refreshed.projected,
            });
        }

        if (proposal.reviewAction === 'disable') {
            const disabled = await memoryService.disableMemory({
                profileId: input.profileId,
                memoryId: input.memoryId,
            });
            if (disabled.isErr()) {
                return errOp(disabled.error.code, disabled.error.message, {
                    ...(disabled.error.details ? { details: disabled.error.details } : {}),
                });
            }

            await writeProjectedMemoryFile(
                toCandidateProjectionForTarget(disabled.value, scanned.value.paths, proposal.projectionTarget)
            );
            const refreshed = await scanProjectedMemory(
                toCandidateProjectionForTarget(disabled.value, scanned.value.paths, proposal.projectionTarget)
            );
            return okOp({
                decision: 'accept',
                appliedAction: 'disable',
                memory: disabled.value,
                projection: refreshed.projected,
            });
        }

        const superseded = await memoryService.supersedeMemory({
            profileId: input.profileId,
            memoryId: input.memoryId,
            createdByKind: 'user',
            title: proposal.proposedTitle,
            bodyMarkdown: proposal.proposedBodyMarkdown,
            ...(proposal.proposedSummaryText ? { summaryText: proposal.proposedSummaryText } : {}),
            metadata: proposal.proposedMetadata,
        });
        if (superseded.isErr()) {
            return errOp(superseded.error.code, superseded.error.message, {
                ...(superseded.error.details ? { details: superseded.error.details } : {}),
            });
        }

        await Promise.all([
            writeProjectedMemoryFile(
                toCandidateProjectionForTarget(
                    superseded.value.previous,
                    scanned.value.paths,
                    proposal.projectionTarget
                )
            ),
            writeProjectedMemoryFile(
                toCandidateProjectionForTarget(
                    superseded.value.replacement,
                    scanned.value.paths,
                    proposal.projectionTarget
                )
            ),
        ]);
        const refreshed = await scanProjectedMemory(
            toCandidateProjectionForTarget(superseded.value.replacement, scanned.value.paths, proposal.projectionTarget)
        );
        return okOp({
            decision: 'accept',
            appliedAction: 'supersede',
            memory: superseded.value.replacement,
            previousMemory: superseded.value.previous,
            projection: refreshed.projected,
        });
    }
}

export const memoryProjectionService = new MemoryProjectionService();
