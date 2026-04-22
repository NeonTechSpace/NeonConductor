import type {
    BrowserContextPacket,
    ComposerAttachmentInput,
    ExecutionReceipt,
    PreparedContextContributorSummary,
    PreparedContextInstructionAuthority,
    PreparedContextTrustLevel,
    RunContractDiffSummary,
    RunContractPreview,
    SessionOutboxEntry,
    SteeringSnapshot,
} from '@/shared/contracts';

import type { PreparedRunStart, StartRunInput } from '@/app/backend/runtime/services/runExecution/types';
import { buildBrowserContextSummary } from '@/app/backend/runtime/services/devBrowser/browserContext';

function createTrustLevelCounts(): Record<PreparedContextTrustLevel, number> {
    return {
        trusted_instruction: 0,
        user_input: 0,
        workspace_content: 0,
        external_untrusted: 0,
        promoted_fact: 0,
    };
}

function createInstructionAuthorityCounts(): Record<PreparedContextInstructionAuthority, number> {
    return {
        instruct: 0,
        contextualize: 0,
        retrieval_only: 0,
    };
}

function buildAttachmentSummary(attachments: ComposerAttachmentInput[] | undefined): RunContractPreview['attachmentSummary'] {
    const imageAttachments = (attachments ?? []).filter((attachment) => attachment.kind !== 'text_file_attachment');
    const textFileAttachments = (attachments ?? []).filter((attachment) => attachment.kind === 'text_file_attachment');

    return {
        totalCount: (attachments ?? []).length,
        imageAttachmentCount: imageAttachments.length,
        textFileAttachmentCount: textFileAttachments.length,
        totalByteSize: (attachments ?? []).reduce(
            (total, attachment) => total + (attachment.kind === 'text_file_attachment' ? attachment.byteSize : (attachment.byteSize ?? 0)),
            0
        ),
    };
}

function buildDynamicExpansionSummary(
    contributors: PreparedContextContributorSummary[]
): RunContractPreview['dynamicExpansionSummary'] {
    const expansions = contributors
        .map((contributor) => contributor.dynamicExpansion)
        .filter((expansion): expansion is NonNullable<PreparedContextContributorSummary['dynamicExpansion']> => expansion !== undefined);

    return {
        resolvedCount: expansions.filter((expansion) => expansion.resolutionState === 'resolved').length,
        blockedCount: expansions.filter((expansion) => expansion.resolutionState === 'pending_approval').length,
        omittedCount: expansions.filter((expansion) => expansion.resolutionState === 'omitted' || expansion.resolutionState === 'preview_only').length,
        failedCount: expansions.filter((expansion) => expansion.resolutionState === 'failed').length,
        invalidCount: expansions.filter((expansion) => expansion.resolutionState === 'invalid').length,
    };
}

function buildTrustSummary(input: {
    prompt: string;
    attachments?: ComposerAttachmentInput[];
    browserContext?: BrowserContextPacket;
    contributors: PreparedContextContributorSummary[];
}): RunContractPreview['trustSummary'] {
    const byTrustLevel = createTrustLevelCounts();
    const byInstructionAuthority = createInstructionAuthorityCounts();

    for (const contributor of input.contributors.filter((contributor) => contributor.inclusionState === 'included')) {
        byTrustLevel[contributor.trustLevel] += 1;
        byInstructionAuthority[contributor.instructionAuthority] += 1;
    }

    if (input.prompt.trim().length > 0) {
        byTrustLevel['user_input'] += 1;
        byInstructionAuthority['instruct'] += 1;
    }

    for (const _attachment of input.attachments ?? []) {
        byTrustLevel['user_input'] += 1;
        byInstructionAuthority['contextualize'] += 1;
    }

    if (input.browserContext) {
        const contextualizedInputCount =
            input.browserContext.selections.length +
            input.browserContext.cropAttachmentIds.length +
            input.browserContext.designerDrafts.length;
        const instructiveInputCount = input.browserContext.comments.length;

        byTrustLevel['user_input'] += contextualizedInputCount + instructiveInputCount;
        byInstructionAuthority['contextualize'] += contextualizedInputCount;
        byInstructionAuthority['instruct'] += instructiveInputCount;
    }

    return {
        contributorCountByTrustLevel: byTrustLevel,
        contributorCountByInstructionAuthority: byInstructionAuthority,
    };
}

function buildSteeringSnapshot(input: {
    startInput: StartRunInput;
    prepared: PreparedRunStart;
}): SteeringSnapshot {
    return {
        profileId: input.startInput.profileId,
        sessionId: input.startInput.sessionId,
        topLevelTab: input.startInput.topLevelTab,
        modeKey: input.startInput.modeKey,
        providerId: input.prepared.activeTarget.providerId,
        modelId: input.prepared.activeTarget.modelId,
        runtimeOptions: input.startInput.runtimeOptions,
        ...(input.startInput.workspaceFingerprint ? { workspaceFingerprint: input.startInput.workspaceFingerprint } : {}),
        ...(input.startInput.sandboxId ? { sandboxId: input.startInput.sandboxId } : {}),
        createdAt: new Date().toISOString(),
    };
}

function buildDiffSummary(previousContract: RunContractPreview | undefined, nextContract: RunContractPreview): RunContractDiffSummary {
    if (!previousContract) {
        return {
            compatible: true,
            hasMaterialChanges: false,
            items: [],
        };
    }

    const items: RunContractDiffSummary['items'] = [];
    if (previousContract.steeringSnapshot.providerId !== nextContract.steeringSnapshot.providerId) {
        items.push({
            field: 'providerId',
            previousValue: previousContract.steeringSnapshot.providerId,
            nextValue: nextContract.steeringSnapshot.providerId,
            reason: 'The resolved provider changed.',
            material: true,
        });
    }
    if (previousContract.steeringSnapshot.modelId !== nextContract.steeringSnapshot.modelId) {
        items.push({
            field: 'modelId',
            previousValue: previousContract.steeringSnapshot.modelId,
            nextValue: nextContract.steeringSnapshot.modelId,
            reason: 'The resolved model changed.',
            material: true,
        });
    }
    if (previousContract.preparedContext.digest.fullDigest !== nextContract.preparedContext.digest.fullDigest) {
        items.push({
            field: 'preparedContextDigest',
            previousValue: previousContract.preparedContext.digest.fullDigest,
            nextValue: nextContract.preparedContext.digest.fullDigest,
            reason: 'The prepared context changed.',
            material: true,
        });
    }
    const previousBrowserContextSummary = previousContract.browserContextSummary;
    const nextBrowserContextSummary = nextContract.browserContextSummary;
    if (previousBrowserContextSummary?.targetUrl !== nextBrowserContextSummary?.targetUrl) {
        items.push({
            field: 'browserContextTargetUrl',
            reason: 'The selected browser target changed.',
            material: true,
            ...(previousBrowserContextSummary?.targetUrl
                ? { previousValue: previousBrowserContextSummary.targetUrl }
                : {}),
            ...(nextBrowserContextSummary?.targetUrl ? { nextValue: nextBrowserContextSummary.targetUrl } : {}),
        });
    }
    if (previousBrowserContextSummary?.digest !== nextBrowserContextSummary?.digest) {
        items.push({
            field: 'browserContextDigest',
            reason: 'The selected browser elements, designer previews, or staged comments changed.',
            material: true,
            ...(previousBrowserContextSummary?.digest ? { previousValue: previousBrowserContextSummary.digest } : {}),
            ...(nextBrowserContextSummary?.digest ? { nextValue: nextBrowserContextSummary.digest } : {}),
        });
    }

    const hasMaterialChanges = items.some((item) => item.material);
    return {
        compatible: !hasMaterialChanges,
        hasMaterialChanges,
        items,
    };
}

export function prepareRunContractPreview(input: {
    startInput: StartRunInput;
    prepared: PreparedRunStart;
    previousCompatibleContract?: RunContractPreview;
}): RunContractPreview | undefined {
    const preparedContext = input.prepared.runContext?.preparedContext;
    if (!preparedContext) {
        return undefined;
    }

    const nextContract: RunContractPreview = {
        steeringSnapshot: buildSteeringSnapshot({
            startInput: input.startInput,
            prepared: input.prepared,
        }),
        preparedContext,
        cache: {
            digest: input.prepared.runContext?.digest ?? preparedContext.digest.fullDigest,
            strategy: input.prepared.resolvedCache.strategy,
            ...(input.prepared.resolvedCache.key ? { key: input.prepared.resolvedCache.key } : {}),
            cacheabilityHint: preparedContext.digest.cacheabilityHint,
        },
        trustSummary: buildTrustSummary({
            prompt: input.startInput.prompt,
            contributors: preparedContext.contributors,
            ...(input.startInput.attachments ? { attachments: input.startInput.attachments } : {}),
            ...(input.startInput.browserContext ? { browserContext: input.startInput.browserContext } : {}),
        }),
        dynamicExpansionSummary: buildDynamicExpansionSummary(preparedContext.contributors),
        attachmentSummary: buildAttachmentSummary(input.startInput.attachments),
        ...(input.startInput.browserContext
            ? { browserContextSummary: buildBrowserContextSummary(input.startInput.browserContext) }
            : {}),
    };

    return {
        ...nextContract,
        diffFromLastCompatible: buildDiffSummary(input.previousCompatibleContract, nextContract),
    };
}

export function summarizeReceiptAttachmentSummary(
    receipt: Pick<ExecutionReceipt, 'contract'>
): RunContractPreview['attachmentSummary'] {
    return receipt.contract.attachmentSummary;
}

export function summarizeOutboxLatestContract(
    entry: Pick<SessionOutboxEntry, 'latestRunContract'>
): RunContractPreview | undefined {
    return entry.latestRunContract;
}
