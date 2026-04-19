import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { permissionStore, toolStore } from '@/app/backend/persistence/stores';
import type { PermissionRecord, ToolRecord } from '@/app/backend/persistence/types';
import type {
    DynamicContextExpansion,
    SkillDynamicContextSource,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import type { PreparedContextContributorSpec } from '@/app/backend/runtime/services/context/preparedContextLedger';
import { resolveEffectivePermissionPolicy } from '@/app/backend/runtime/services/permissions/policyResolver';
import { getExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';
import { buildShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';
import { invokeToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers';
import { buildSkillDynamicCommandDigest } from '@/app/backend/runtime/services/sessionSkills/dynamicContextSources';

import type { ResolvedWorkspaceContext, SkillfileDefinition } from '@/shared/contracts';

const TRUNCATION_MARKER = '\n\n... dynamic context truncated ...';

export interface ResolvedDynamicSkillContributorSpec {
    parentSkillAssetKey: string;
    spec: PreparedContextContributorSpec;
}

interface DynamicSkillContextResolution {
    contributors: ResolvedDynamicSkillContributorSpec[];
    blockingPermissionRequest?: PermissionRecord['id'];
}

function isWorkspaceBoundContext(
    value: ResolvedWorkspaceContext | null | undefined
): value is Extract<ResolvedWorkspaceContext, { kind: 'workspace' | 'sandbox' }> {
    return value?.kind === 'workspace' || value?.kind === 'sandbox';
}

function createExpansionDigest(prefix: string, value: string): string {
    return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function buildDynamicSkillSourceKey(skillfile: SkillfileDefinition, source: SkillDynamicContextSource): string {
    return `dynamic_skill_context:${skillfile.assetKey}:${source.id}`;
}

function createDynamicExpansion(input: {
    source: SkillDynamicContextSource;
    resolutionState: DynamicContextExpansion['resolutionState'];
    commandDigest: string;
    truncated?: boolean;
    failureReason?: string;
    permissionRequestId?: PermissionRecord['id'];
    outputDigest?: string;
}): DynamicContextExpansion {
    return {
        sourceId: input.source.id,
        sourceLabel: input.source.label,
        required: input.source.required,
        ...(input.source.effectiveSafetyClass ? { effectiveSafetyClass: input.source.effectiveSafetyClass } : {}),
        resolutionState: input.resolutionState,
        commandDigest: input.commandDigest,
        truncated: input.truncated ?? false,
        ...(input.failureReason ? { failureReason: input.failureReason } : {}),
        ...(input.permissionRequestId ? { permissionRequestId: input.permissionRequestId } : {}),
        ...(input.outputDigest ? { outputDigest: input.outputDigest } : {}),
    };
}

function buildDynamicContextMessage(input: {
    skillfile: SkillfileDefinition;
    source: SkillDynamicContextSource;
    outputText: string;
    truncated: boolean;
}) {
    const truncationNote = input.truncated
        ? 'This dynamic context output was truncated before injection.'
        : 'This dynamic context output was captured immediately before execution.';
    return createTextMessage(
        'system',
        [
            `Attached skill "${input.skillfile.name}" dynamic context "${input.source.label}"`,
            '',
            truncationNote,
            '',
            input.outputText.trim(),
        ].join('\n')
    );
}

function buildExcludedContributor(input: {
    skillfile: SkillfileDefinition;
    source: SkillDynamicContextSource;
    resolutionState: DynamicContextExpansion['resolutionState'];
    inclusionReason: string;
    failureReason?: string | undefined;
    permissionRequestId?: PermissionRecord['id'] | undefined;
}): ResolvedDynamicSkillContributorSpec {
    const commandDigest = buildSkillDynamicCommandDigest(input.source.command);
    return {
        parentSkillAssetKey: input.skillfile.assetKey,
        spec: {
            id: buildDynamicSkillSourceKey(input.skillfile, input.source),
            kind: 'dynamic_skill_context',
            group: 'dynamic_skill_context',
            label: `Dynamic skill context: ${input.skillfile.name} / ${input.source.label}`,
            source: {
                kind: 'skill_dynamic_context',
                key: `${input.skillfile.assetKey}:${input.source.id}`,
                label: `${input.skillfile.name} / ${input.source.label}`,
            },
            messages: [],
            fixedCheckpoint: 'bootstrap',
            fixedInclusionState: 'excluded',
            inclusionReason: input.inclusionReason,
            dynamicExpansion: createDynamicExpansion({
                source: input.source,
                resolutionState: input.resolutionState,
                commandDigest,
                ...(input.failureReason ? { failureReason: input.failureReason } : {}),
                ...(input.permissionRequestId ? { permissionRequestId: input.permissionRequestId } : {}),
            }),
        },
    };
}

function limitByBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
    const totalBytes = Buffer.byteLength(text, 'utf8');
    if (totalBytes <= maxBytes) {
        return { text, truncated: false };
    }

    const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, 'utf8');
    const availableBytes = Math.max(1, maxBytes - markerBytes);
    const truncatedText = `${Buffer.from(text, 'utf8').subarray(0, availableBytes).toString('utf8')}${TRUNCATION_MARKER}`;
    return { text: truncatedText, truncated: true };
}

function limitByLines(text: string, maxLines: number): { text: string; truncated: boolean } {
    const lines = text.split(/\r\n|\r|\n/u);
    if (lines.length <= maxLines) {
        return { text, truncated: false };
    }

    return {
        text: `${lines.slice(0, maxLines).join('\n')}${TRUNCATION_MARKER}`,
        truncated: true,
    };
}

function applyCaptureBounds(input: {
    source: SkillDynamicContextSource;
    text: string;
    preTruncated: boolean;
}): { text: string; truncated: boolean } {
    let nextText = input.text;
    let truncated = input.preTruncated;

    if (input.source.maxLines !== undefined) {
        const limitedByLines = limitByLines(nextText, input.source.maxLines);
        nextText = limitedByLines.text;
        truncated = truncated || limitedByLines.truncated;
    }

    if (input.source.maxBytes !== undefined) {
        const limitedByBytes = limitByBytes(nextText, input.source.maxBytes);
        nextText = limitedByBytes.text;
        truncated = truncated || limitedByBytes.truncated;
    }

    return {
        text: nextText,
        truncated,
    };
}

function readCommandOutput(output: Record<string, unknown>): {
    text: string;
    truncated: boolean;
    failed: boolean;
    failureReason?: string;
} {
    const stdout = typeof output['stdout'] === 'string' ? output['stdout'].trim() : '';
    const stderr = typeof output['stderr'] === 'string' ? output['stderr'].trim() : '';
    const timedOut = output['timedOut'] === true;
    const exitCode = typeof output['exitCode'] === 'number' ? output['exitCode'] : null;
    const stdoutTruncated = output['stdoutTruncated'] === true;
    const stderrTruncated = output['stderrTruncated'] === true;

    if (timedOut) {
        return {
            text: '',
            truncated: stdoutTruncated || stderrTruncated,
            failed: true,
            failureReason: 'Dynamic skill context command timed out.',
        };
    }
    if (exitCode !== null && exitCode !== 0) {
        return {
            text: '',
            truncated: stdoutTruncated || stderrTruncated,
            failed: true,
            failureReason: stderr || stdout || `Dynamic skill context command exited with code ${String(exitCode)}.`,
        };
    }

    const sections = [];
    if (stdout.length > 0) {
        sections.push(stdout);
    }
    if (stderr.length > 0) {
        sections.push(`stderr:\n${stderr}`);
    }

    return {
        text: sections.join('\n\n').trim() || 'Command produced no output.',
        truncated: stdoutTruncated || stderrTruncated,
        failed: false,
    };
}

async function findRunCommandTool(): Promise<ToolRecord> {
    const runCommandTool = (await toolStore.list()).find((tool) => tool.id === 'run_command');
    if (!runCommandTool) {
        throw new Error('Shell tool catalog entry "run_command" is missing.');
    }
    return runCommandTool;
}

function appendDynamicContributors(input: {
    baseContributorSpecs: PreparedContextContributorSpec[];
    dynamicContributors: ResolvedDynamicSkillContributorSpec[];
}): PreparedContextContributorSpec[] {
    if (input.dynamicContributors.length === 0) {
        return input.baseContributorSpecs;
    }

    const dynamicBySkillKey = new Map<string, PreparedContextContributorSpec[]>();
    for (const contributor of input.dynamicContributors) {
        const existing = dynamicBySkillKey.get(contributor.parentSkillAssetKey) ?? [];
        existing.push(contributor.spec);
        dynamicBySkillKey.set(contributor.parentSkillAssetKey, existing);
    }

    const combined: PreparedContextContributorSpec[] = [];
    for (const spec of input.baseContributorSpecs) {
        combined.push(spec);
        if (spec.kind === 'attached_skill' && spec.source.kind === 'skill') {
            combined.push(...(dynamicBySkillKey.get(spec.source.key) ?? []));
        }
    }

    return combined;
}

async function createPermissionRequest(input: {
    profileId: string;
    workspaceFingerprint?: string;
    skillfile: SkillfileDefinition;
    source: SkillDynamicContextSource;
    absolutePath: string;
    commandText: string;
    toolId: string;
    approvalCandidates: NonNullable<PermissionRecord['approvalCandidates']>;
    resource: string;
}): Promise<PermissionRecord> {
    const request = await permissionStore.create({
        profileId: input.profileId,
        policy: 'ask',
        resource: input.resource,
        toolId: input.toolId,
        scopeKind: 'tool',
        summary: {
            title: 'Dynamic Skill Context Approval',
            detail: `Dynamic skill context "${input.skillfile.name} / ${input.source.label}" wants to run "${input.commandText}" in ${input.absolutePath}.`,
        },
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        commandText: input.commandText,
        approvalCandidates: input.approvalCandidates,
        rationale: `Requested by attached skill "${input.skillfile.name}" dynamic source "${input.source.label}".`,
    });

    await runtimeEventLogService.append(
        runtimeStatusEvent({
            entityType: 'permission',
            domain: 'permission',
            entityId: request.id,
            eventType: 'permission.requested',
            payload: {
                request,
            },
        })
    );

    return request;
}

export async function resolveDynamicSkillContextContributors(input: {
    profileId: string;
    sessionId: `sess_${string}`;
    topLevelTab: TopLevelTab;
    modeKey: string;
    skillfiles: SkillfileDefinition[];
    workspaceFingerprint?: string;
    workspaceContext?: ResolvedWorkspaceContext | null;
    sideEffectMode: 'execution' | 'preview';
}): Promise<OperationalResult<DynamicSkillContextResolution>> {
    const runCommandTool = await findRunCommandTool();
    const executionPreset = await getExecutionPreset(input.profileId);
    const workspaceContext = input.workspaceContext;
    const absolutePath = isWorkspaceBoundContext(workspaceContext) ? workspaceContext.absolutePath : undefined;
    const contributors: ResolvedDynamicSkillContributorSpec[] = [];

    for (const skillfile of input.skillfiles) {
        for (const source of skillfile.dynamicContextSources) {
            const commandDigest = buildSkillDynamicCommandDigest(source.command);
            const shellApprovalContext = buildShellApprovalContext(source.command);

            if (source.validationState === 'invalid') {
                if (input.sideEffectMode === 'execution' && source.required) {
                    return errOp(
                        'runtime_option_invalid',
                        `Required dynamic skill context source "${source.label}" in skill "${skillfile.name}" is invalid: ${source.validationMessage ?? 'Invalid declaration.'}`
                    );
                }

                contributors.push(
                    buildExcludedContributor({
                        skillfile,
                        source,
                        resolutionState: 'invalid',
                        inclusionReason: source.validationMessage ?? 'Dynamic skill context declaration is invalid.',
                        failureReason: source.validationMessage,
                    })
                );
                continue;
            }

            if (!absolutePath) {
                if (input.sideEffectMode === 'execution' && source.required) {
                    return errOp(
                        'runtime_option_invalid',
                        `Required dynamic skill context source "${source.label}" in skill "${skillfile.name}" needs a workspace-bound execution context.`
                    );
                }

                contributors.push(
                    buildExcludedContributor({
                        skillfile,
                        source,
                        resolutionState: input.sideEffectMode === 'preview' ? 'preview_only' : 'omitted',
                        inclusionReason:
                            input.sideEffectMode === 'preview'
                                ? 'Dynamic skill context resolves during execution only, and no workspace-bound execution context is available.'
                                : 'Optional dynamic skill context was omitted because no workspace-bound execution context is available.',
                        failureReason: 'Workspace-bound execution context is unavailable.',
                    })
                );
                continue;
            }

            const resolvedPolicy = await resolveEffectivePermissionPolicy({
                profileId: input.profileId,
                resource: shellApprovalContext.commandResource,
                resourceCandidates: shellApprovalContext.overrideResources,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                executionPreset,
                capabilities: runCommandTool.capabilities,
                mutability: runCommandTool.mutability,
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                toolDefaultPolicy: runCommandTool.permissionPolicy,
            });

            if (input.sideEffectMode === 'preview') {
                const previewReason =
                    resolvedPolicy.policy === 'deny'
                        ? 'Dynamic skill context is denied by the current shell safety policy.'
                        : source.effectiveSafetyClass === 'unsafe' && resolvedPolicy.policy === 'ask'
                          ? 'Dynamic skill context resolves during execution only and requires approval before it can run.'
                          : 'Dynamic skill context resolves during execution only.';
                contributors.push(
                    buildExcludedContributor({
                        skillfile,
                        source,
                        resolutionState: 'preview_only',
                        inclusionReason: previewReason,
                        ...(resolvedPolicy.policy === 'deny'
                            ? { failureReason: 'Current mode or shell safety policy denies this dynamic source.' }
                            : {}),
                    })
                );
                continue;
            }

            if (resolvedPolicy.policy === 'deny') {
                const deniedMessage = `Dynamic skill context source "${source.label}" in skill "${skillfile.name}" is denied by the current shell safety policy.`;
                if (source.required) {
                    return errOp('runtime_option_invalid', deniedMessage);
                }

                contributors.push(
                    buildExcludedContributor({
                        skillfile,
                        source,
                        resolutionState: 'omitted',
                        inclusionReason: 'Optional dynamic skill context was omitted because the current shell safety policy denies it.',
                        failureReason: deniedMessage,
                    })
                );
                continue;
            }

            if (source.effectiveSafetyClass === 'unsafe' && resolvedPolicy.policy === 'ask') {
                const onceApproval = await permissionStore.consumeGrantedOnce({
                    profileId: input.profileId,
                    resource: shellApprovalContext.commandResource,
                    ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                });

                if (!onceApproval) {
                    const request = await createPermissionRequest({
                        profileId: input.profileId,
                        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                        skillfile,
                        source,
                        absolutePath,
                        commandText: shellApprovalContext.commandText,
                        toolId: runCommandTool.id,
                        approvalCandidates: shellApprovalContext.approvalCandidates,
                        resource: shellApprovalContext.commandResource,
                    });

                    return errOp(
                        'permission_required',
                        `Dynamic skill context source "${source.label}" in skill "${skillfile.name}" requires approval before this run can start.`,
                        {
                            details: {
                                requestId: request.id,
                            },
                        }
                    );
                }
            }

            const executionResult = await invokeToolHandler(
                runCommandTool,
                {
                    command: shellApprovalContext.commandText,
                    ...(source.timeoutMs !== undefined ? { timeoutMs: source.timeoutMs } : {}),
                },
                {
                    cwd: absolutePath,
                }
            );

            if (executionResult.isErr()) {
                const failureMessage = `Dynamic skill context source "${source.label}" in skill "${skillfile.name}" failed: ${executionResult.error.message}`;
                if (source.required) {
                    return errOp('runtime_option_invalid', failureMessage);
                }

                contributors.push(
                    buildExcludedContributor({
                        skillfile,
                        source,
                        resolutionState: 'failed',
                        inclusionReason: 'Optional dynamic skill context failed and was omitted.',
                        failureReason: failureMessage,
                    })
                );
                continue;
            }

            const outputRecord =
                typeof executionResult.value === 'object' && executionResult.value !== null
                    ? (executionResult.value as Record<string, unknown>)
                    : {};
            const commandOutput = readCommandOutput(outputRecord);
            if (commandOutput.failed) {
                const failureMessage = `Dynamic skill context source "${source.label}" in skill "${skillfile.name}" failed: ${commandOutput.failureReason ?? 'Command execution failed.'}`;
                if (source.required) {
                    return errOp('runtime_option_invalid', failureMessage);
                }

                contributors.push(
                    buildExcludedContributor({
                        skillfile,
                        source,
                        resolutionState: 'failed',
                        inclusionReason: 'Optional dynamic skill context failed and was omitted.',
                        failureReason: failureMessage,
                    })
                );
                continue;
            }

            const boundedOutput = applyCaptureBounds({
                source,
                text: commandOutput.text,
                preTruncated: commandOutput.truncated,
            });
            const outputDigest = createExpansionDigest('dynctxout', boundedOutput.text);

            contributors.push({
                parentSkillAssetKey: skillfile.assetKey,
                spec: {
                    id: buildDynamicSkillSourceKey(skillfile, source),
                    kind: 'dynamic_skill_context',
                    group: 'dynamic_skill_context',
                    label: `Dynamic skill context: ${skillfile.name} / ${source.label}`,
                    source: {
                        kind: 'skill_dynamic_context',
                        key: `${skillfile.assetKey}:${source.id}`,
                        label: `${skillfile.name} / ${source.label}`,
                    },
                    messages: [
                        buildDynamicContextMessage({
                            skillfile,
                            source,
                            outputText: boundedOutput.text,
                            truncated: boundedOutput.truncated,
                        }),
                    ],
                    fixedCheckpoint: 'bootstrap',
                    fixedInclusionState: 'included',
                    inclusionReason: 'Included from attached skill dynamic context resolved immediately before execution.',
                    dynamicExpansion: createDynamicExpansion({
                        source,
                        resolutionState: 'resolved',
                        commandDigest,
                        truncated: boundedOutput.truncated,
                        outputDigest,
                    }),
                },
            });
        }
    }

    return okOp({
        contributors,
    });
}

export { appendDynamicContributors };
