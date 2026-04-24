import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getPersistence } from '@/app/backend/persistence/db';
import { toolResultArtifactStore } from '@/app/backend/persistence/stores';
import type {
    RegistryApplyPromotionInput,
    RegistryApplyPromotionResult,
    RegistryPreparePromotionInput,
    RegistryPreparePromotionResult,
    RegistryPromotionDraft,
    RegistryPromotionProvenance,
    RegistryPromotionSource,
    RegistryPromotionTarget,
    RegistryPromotionTargeting,
    RuleActivationMode,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { resolveRegistryPaths, slugifyAssetKey } from '@/app/backend/runtime/services/registry/filesystem';
import { refreshRegistry } from '@/app/backend/runtime/services/registry/registryRefreshLifecycle';

interface ExtractedPromotionSource {
    source: RegistryPromotionSource;
    sourceText: string;
    sourceLabel: string;
    sourceDigest: string;
    lineCount: number;
}

const promotedAssetAllowedTargets: Record<RegistryPromotionTarget, string> = {
    rule: 'Rule',
    skill_snippet: 'Skill Snippet',
};

function sha256Text(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeBodyMarkdown(value: string): string {
    return value.replace(/\r\n?/g, '\n').trim();
}

function countLines(value: string): number {
    if (value.length === 0) {
        return 0;
    }
    return value.split('\n').length;
}

function stringifyFrontmatterValue(value: string): string {
    return JSON.stringify(value.replace(/\r\n?/g, '\n').trim());
}

function renderStringListFrontmatter(field: string, values: string[] | undefined): string[] {
    if (!values || values.length === 0) {
        return [];
    }

    return [field, ...values.map((value) => `  - ${stringifyFrontmatterValue(value)}`)];
}

function renderPromotionProvenanceFrontmatter(provenance: RegistryPromotionProvenance): string[] {
    return [
        'neonPromotion:',
        `  sourceKind: ${provenance.sourceKind}`,
        `  sourceSessionId: ${stringifyFrontmatterValue(provenance.sourceSessionId)}`,
        ...(provenance.sourceMessageId
            ? [`  sourceMessageId: ${stringifyFrontmatterValue(provenance.sourceMessageId)}`]
            : []),
        ...(provenance.sourceMessagePartId
            ? [`  sourceMessagePartId: ${stringifyFrontmatterValue(provenance.sourceMessagePartId)}`]
            : []),
        `  sourceLabel: ${stringifyFrontmatterValue(provenance.sourceLabel)}`,
        `  sourceDigest: ${stringifyFrontmatterValue(provenance.sourceDigest)}`,
        ...(provenance.startLine !== undefined ? [`  startLine: ${String(provenance.startLine)}`] : []),
        ...(provenance.lineCount !== undefined ? [`  lineCount: ${String(provenance.lineCount)}`] : []),
        `  promotedAt: ${stringifyFrontmatterValue(provenance.promotedAt)}`,
    ];
}

function createProvenance(input: ExtractedPromotionSource): RegistryPromotionProvenance {
    return {
        sourceKind: input.source.kind,
        sourceSessionId: input.source.sessionId,
        ...(input.source.kind === 'message' ? { sourceMessageId: input.source.messageId } : {}),
        ...(input.source.kind === 'tool_result_artifact_window'
            ? {
                  sourceMessagePartId: input.source.messagePartId,
                  startLine: input.source.startLine,
                  lineCount: input.source.lineCount,
              }
            : {}),
        sourceLabel: input.sourceLabel,
        sourceDigest: input.sourceDigest,
        promotedAt: new Date().toISOString(),
    };
}

function defaultKeyFromSource(input: { target: RegistryPromotionTarget; source: ExtractedPromotionSource }): string {
    const prefix = input.target === 'rule' ? 'promoted-rule' : 'promoted-skill';
    return slugifyAssetKey(`${prefix}-${input.source.sourceDigest.slice(0, 10)}`).replace(/\//g, '-');
}

function defaultNameFromSource(input: { target: RegistryPromotionTarget; source: ExtractedPromotionSource }): string {
    return `${promotedAssetAllowedTargets[input.target]} from ${input.source.sourceLabel}`;
}

function renderTargetingFrontmatter(targeting: RegistryPromotionTargeting): string[] {
    if (targeting.targetKind === 'shared') {
        return [];
    }

    if (targeting.targetKind === 'preset') {
        return [`presetKey: ${targeting.presetKey}`];
    }

    return [
        `targetTopLevelTab: ${targeting.targetMode.topLevelTab}`,
        `targetModeKey: ${stringifyFrontmatterValue(targeting.targetMode.modeKey)}`,
    ];
}

function renderRuleFile(input: {
    draft: RegistryPromotionDraft;
    assetKey: string;
    provenance: RegistryPromotionProvenance;
}): string {
    const activationMode: RuleActivationMode = input.draft.activationMode ?? 'manual';
    return [
        '---',
        `key: ${input.assetKey}`,
        `name: ${stringifyFrontmatterValue(input.draft.name)}`,
        `activationMode: ${activationMode}`,
        ...renderTargetingFrontmatter(input.draft.targeting),
        ...(input.draft.description ? [`description: ${stringifyFrontmatterValue(input.draft.description)}`] : []),
        ...renderStringListFrontmatter('tags:', input.draft.tags),
        ...renderPromotionProvenanceFrontmatter(input.provenance),
        '---',
        input.draft.bodyMarkdown,
        '',
    ].join('\n');
}

function renderSkillFile(input: {
    draft: RegistryPromotionDraft;
    assetKey: string;
    provenance: RegistryPromotionProvenance;
}): string {
    return [
        '---',
        `key: ${input.assetKey}`,
        `name: ${stringifyFrontmatterValue(input.draft.name)}`,
        ...renderTargetingFrontmatter(input.draft.targeting),
        ...(input.draft.description ? [`description: ${stringifyFrontmatterValue(input.draft.description)}`] : []),
        ...renderStringListFrontmatter('tags:', input.draft.tags),
        ...renderPromotionProvenanceFrontmatter(input.provenance),
        '---',
        input.draft.bodyMarkdown,
        '',
    ].join('\n');
}

function targetFolderSegments(targeting: RegistryPromotionTargeting): string[] {
    if (targeting.targetKind === 'shared') {
        return ['shared'];
    }
    if (targeting.targetKind === 'preset') {
        return ['presets', targeting.presetKey];
    }
    return ['modes', targeting.targetMode.topLevelTab, targeting.targetMode.modeKey];
}

function buildRelativeRootPath(input: {
    target: RegistryPromotionTarget;
    targeting: RegistryPromotionTargeting;
    assetSlug: string;
}): string {
    const baseSegments = input.target === 'rule' ? ['rules'] : ['skills'];
    const targetSegments = targetFolderSegments(input.targeting);
    if (input.target === 'rule') {
        return path.join(...baseSegments, ...targetSegments, `${input.assetSlug}.md`);
    }
    return path.join(...baseSegments, ...targetSegments, input.assetSlug, 'SKILL.md');
}

async function assertNoExistingSymlinkSegments(input: { rootPath: string; targetPath: string }): Promise<void> {
    const root = path.resolve(input.rootPath);
    const relativeDirectory = path.relative(root, path.dirname(input.targetPath));
    if (!relativeDirectory || relativeDirectory.startsWith('..')) {
        return;
    }

    let current = root;
    for (const segment of relativeDirectory.split(path.sep)) {
        if (!segment) {
            continue;
        }
        current = path.join(current, segment);
        try {
            const stats = await lstat(current);
            if (stats.isSymbolicLink()) {
                throw new Error(`Promoted registry asset target crosses a linked directory: ${current}`);
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return;
            }
            throw error;
        }
    }
}

async function resolveNativeRoot(input: {
    profileId: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
}): Promise<string> {
    const paths = await resolveRegistryPaths({
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (input.scope === 'workspace') {
        if (!input.workspaceFingerprint || !paths.nativeRulesSkillsRoots.workspaceRoot) {
            throw new Error('Workspace promotion requires a selected workspace.');
        }
        return paths.nativeRulesSkillsRoots.workspaceRoot;
    }
    return paths.nativeRulesSkillsRoots.globalRoot;
}

async function writePromotedAsset(input: {
    rootPath: string;
    relativeRootPath: string;
    fileContent: string;
    overwrite: boolean;
}): Promise<string> {
    await mkdir(input.rootPath, { recursive: true });
    const canonicalRoot = await realpath(input.rootPath);
    const absolutePath = path.resolve(canonicalRoot, input.relativeRootPath);
    const relative = path.relative(canonicalRoot, absolutePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Promoted registry asset path escaped the native registry root.');
    }

    await assertNoExistingSymlinkSegments({
        rootPath: canonicalRoot,
        targetPath: absolutePath,
    });

    try {
        const existingStats = await lstat(absolutePath);
        if (existingStats.isSymbolicLink()) {
            throw new Error('Promoted registry asset target is a linked file.');
        }
        if (!input.overwrite) {
            throw new Error('A native registry asset already exists at the promoted target path.');
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }

    await mkdir(path.dirname(absolutePath), { recursive: true });
    const tempPath = `${absolutePath}.${String(process.pid)}.${randomUUID()}.tmp`;
    await writeFile(tempPath, input.fileContent, 'utf8');
    await rename(tempPath, absolutePath);
    return absolutePath;
}

async function extractMessageSource(input: {
    profileId: string;
    source: Extract<RegistryPromotionSource, { kind: 'message' }>;
}): Promise<OperationalResult<ExtractedPromotionSource>> {
    const { db } = getPersistence();
    const message = await db
        .selectFrom('messages')
        .select(['id', 'role'])
        .where('id', '=', input.source.messageId)
        .where('profile_id', '=', input.profileId)
        .where('session_id', '=', input.source.sessionId)
        .executeTakeFirst();
    if (!message) {
        return errOp('not_found', 'The source message could not be found for this session.');
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
        return errOp('invalid_input', 'Only user and assistant messages can be promoted as transcript material.');
    }

    const parts = await db
        .selectFrom('message_parts')
        .select(['part_type', 'payload_json'])
        .where('message_id', '=', input.source.messageId)
        .orderBy('sequence', 'asc')
        .execute();
    const text = parts
        .flatMap((part) => {
            if (part.part_type !== 'text' && part.part_type !== 'text_file_attachment') {
                return [];
            }
            const payload = JSON.parse(part.payload_json) as Record<string, unknown>;
            const partText = typeof payload['text'] === 'string' ? normalizeBodyMarkdown(payload['text']) : '';
            return partText.length > 0 ? [partText] : [];
        })
        .join('\n\n');
    if (text.length === 0) {
        return errOp('invalid_input', 'The source message has no promotable text content.');
    }

    return okOp({
        source: input.source,
        sourceText: text,
        sourceLabel: `${message.role} message ${input.source.messageId}`,
        sourceDigest: sha256Text(text),
        lineCount: countLines(text),
    });
}

async function extractArtifactWindowSource(input: {
    profileId: string;
    source: Extract<RegistryPromotionSource, { kind: 'tool_result_artifact_window' }>;
}): Promise<OperationalResult<ExtractedPromotionSource>> {
    const artifactWindow = await toolResultArtifactStore.readLineWindow({
        messagePartId: input.source.messagePartId,
        startLine: input.source.startLine,
        lineCount: input.source.lineCount,
    });
    if (
        !artifactWindow ||
        artifactWindow.artifact.profileId !== input.profileId ||
        artifactWindow.artifact.sessionId !== input.source.sessionId
    ) {
        return errOp('not_found', 'The source tool artifact window could not be found for this session.');
    }

    const text = normalizeBodyMarkdown(artifactWindow.lines.map((line) => line.text).join('\n'));
    if (text.length === 0) {
        return errOp('invalid_input', 'The selected artifact window has no promotable text content.');
    }

    return okOp({
        source: input.source,
        sourceText: text,
        sourceLabel: `${artifactWindow.artifact.toolName} lines ${String(artifactWindow.startLine)}-${String(
            artifactWindow.lines.at(-1)?.lineNumber ?? artifactWindow.startLine
        )}`,
        sourceDigest: sha256Text(text),
        lineCount: countLines(text),
    });
}

async function extractPromotionSource(input: {
    profileId: string;
    source: RegistryPromotionSource;
}): Promise<OperationalResult<ExtractedPromotionSource>> {
    if (input.source.kind === 'message') {
        return extractMessageSource({
            profileId: input.profileId,
            source: input.source,
        });
    }

    return extractArtifactWindowSource({
        profileId: input.profileId,
        source: input.source,
    });
}

function buildDraft(input: RegistryPreparePromotionInput & { extracted: ExtractedPromotionSource }): RegistryPromotionDraft {
    const key = defaultKeyFromSource({
        target: input.target,
        source: input.extracted,
    });

    return {
        target: input.target,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        targeting: input.targeting,
        key,
        name: defaultNameFromSource({
            target: input.target,
            source: input.extracted,
        }),
        bodyMarkdown: input.extracted.sourceText,
        ...(input.target === 'rule' ? { activationMode: 'manual' } : {}),
    };
}

export async function preparePromotion(
    input: RegistryPreparePromotionInput
): Promise<OperationalResult<RegistryPreparePromotionResult>> {
    const extractedResult = await extractPromotionSource(input);
    if (extractedResult.isErr()) {
        return errOp(extractedResult.error.code, extractedResult.error.message, {
            ...(extractedResult.error.details ? { details: extractedResult.error.details } : {}),
        });
    }

    const extracted = extractedResult.value;
    const provenance = createProvenance(extracted);
    return okOp({
        source: {
            kind: extracted.source.kind,
            label: extracted.sourceLabel,
            digest: extracted.sourceDigest,
            lineCount: extracted.lineCount,
        },
        draft: buildDraft({
            ...input,
            extracted,
        }),
        provenance,
    });
}

export async function applyPromotion(
    input: RegistryApplyPromotionInput
): Promise<OperationalResult<RegistryApplyPromotionResult>> {
    const extractedResult = await extractPromotionSource({
        profileId: input.profileId,
        source: input.source,
    });
    if (extractedResult.isErr()) {
        return errOp(extractedResult.error.code, extractedResult.error.message);
    }
    const extracted = extractedResult.value;
    if (input.sourceDigest !== extracted.sourceDigest) {
        return errOp(
            'invalid_input',
            'The promotion source changed after review. Reopen promotion review before applying.'
        );
    }

    const bodyMarkdown = normalizeBodyMarkdown(input.draft.bodyMarkdown);
    if (bodyMarkdown.length === 0) {
        return errOp('invalid_input', 'Promoted asset body cannot be empty.');
    }
    const assetSlug = slugifyAssetKey(input.draft.key).replace(/\//g, '-');
    if (!assetSlug) {
        return errOp('invalid_input', 'Promoted asset key cannot be empty.');
    }
    const relativeRootPath = buildRelativeRootPath({
        target: input.draft.target,
        targeting: input.draft.targeting,
        assetSlug,
    });
    const provenance = createProvenance(extracted);
    const draft = {
        ...input.draft,
        key: assetSlug,
        bodyMarkdown,
    };
    const fileContent =
        input.draft.target === 'rule'
            ? renderRuleFile({ draft, assetKey: assetSlug, provenance })
            : renderSkillFile({ draft, assetKey: assetSlug, provenance });

    try {
        const rootPath = await resolveNativeRoot({
            profileId: input.profileId,
            scope: input.draft.scope,
            ...(input.draft.workspaceFingerprint ? { workspaceFingerprint: input.draft.workspaceFingerprint } : {}),
        });
        const absolutePath = await writePromotedAsset({
            rootPath,
            relativeRootPath,
            fileContent,
            overwrite: input.overwrite,
        });
        const refreshed = await refreshRegistry({
            profileId: input.profileId,
            ...(input.draft.workspaceFingerprint ? { workspaceFingerprint: input.draft.workspaceFingerprint } : {}),
        });

        return okOp({
            promoted: {
                target: input.draft.target,
                assetKey: assetSlug,
                name: input.draft.name,
                scope: input.draft.scope,
                absolutePath,
                relativeRootPath: relativeRootPath.replace(/\\/g, '/'),
            },
            resolvedRegistry: refreshed.resolvedRegistry,
        });
    } catch (error) {
        return errOp('invalid_input', error instanceof Error ? error.message : 'Promotion failed.');
    }
}
