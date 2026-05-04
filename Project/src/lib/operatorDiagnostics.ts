import { formatRuntimeCapabilityIssue } from '@/web/lib/runtimeCapabilityIssue';

import {
    formatCloudSessionSyncBackExpectationReason,
    type CloudSessionSyncBackExpectation,
    type RegistryDiscoveryDiagnostic,
    type RunContractDiffItem,
    type RunContractDocumentSummary,
    type RunContractDynamicExpansionSummary,
    type RunContractPreview,
    type RuntimeCompatibilityIssue,
    type RuntimeProviderId,
    type SandboxDiagnostic,
    type SessionOutboxEntry,
} from '@/shared/contracts';

export type OperatorDiagnosticTone = 'info' | 'warning' | 'error';

export interface OperatorDiagnosticMetadataItem {
    label: string;
    value: string;
}

export interface OperatorDiagnosticViewModel {
    tone: OperatorDiagnosticTone;
    title: string;
    detail: string;
    metadata?: OperatorDiagnosticMetadataItem[];
    actionLabel?: string;
}

export type ContextSummaryMissingReason =
    | 'missing_model_limits'
    | 'feature_disabled'
    | 'multimodal_counting_unavailable';

export interface ContextSummaryDiagnosticInput {
    missingReason?: ContextSummaryMissingReason | undefined;
    blockedDynamicSkillContributorCount: number;
    contextFeedback?:
        | {
              message: string;
              tone: 'success' | 'error' | 'info';
          }
        | undefined;
}

export interface MemoryTruthDiagnosticInput {
    hasConflictingCurrentTruth: boolean;
    memoryId: string;
    currentTruthMemoryId?: string | undefined;
}

export function createOperatorDiagnostic(diagnostic: OperatorDiagnosticViewModel): OperatorDiagnosticViewModel {
    return diagnostic;
}

function formatDelimitedLabel(value: string): string {
    return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatBlockedReason(value: string): string {
    return value.replaceAll('_', ' ');
}

function formatCount(value: number, singular: string, plural = `${singular}s`): string {
    return `${String(value)} ${value === 1 ? singular : plural}`;
}

function toMetadata(label: string, value: string | number | undefined): OperatorDiagnosticMetadataItem | undefined {
    if (value === undefined) {
        return undefined;
    }

    return {
        label,
        value: String(value),
    };
}

function compactMetadata(
    items: Array<OperatorDiagnosticMetadataItem | undefined>
): OperatorDiagnosticMetadataItem[] | undefined {
    const metadata = items.filter((item): item is OperatorDiagnosticMetadataItem => item !== undefined);
    return metadata.length > 0 ? metadata : undefined;
}

export function buildRuntimeCapabilityIssueDiagnostic(input: {
    issue?: RuntimeCompatibilityIssue | undefined;
    message?: string | undefined;
    providerById?: Map<RuntimeProviderId, { label: string }> | undefined;
    providerLabel?: string | undefined;
}): OperatorDiagnosticViewModel {
    return {
        tone: 'error',
        title: 'Run cannot start',
        detail: formatRuntimeCapabilityIssue({
            issue: input.issue,
            message: input.message,
            surface: 'run_rejection',
            providerById: input.providerById,
            providerLabel: input.providerLabel,
        }),
    };
}

function buildDocumentDiagnostic(document: RunContractDocumentSummary): OperatorDiagnosticViewModel | undefined {
    if (!document.blockedReason) {
        return undefined;
    }

    const metadata = compactMetadata([
        toMetadata('State', formatDelimitedLabel(document.extractionState)),
        toMetadata('Selected tokens', document.selectedTokenCount),
        toMetadata('Omitted pages', document.omittedPageCount),
    ]);

    return {
        tone: 'error',
        title: 'PDF document cannot be included',
        detail: `${document.fileName} is blocked because ${formatBlockedReason(document.blockedReason)}. Remove it or attach a text-extractable PDF.`,
        ...(metadata ? { metadata } : {}),
        actionLabel: 'Remove or replace PDF',
    };
}

function buildDynamicExpansionDiagnostic(
    summary: RunContractDynamicExpansionSummary
): OperatorDiagnosticViewModel | undefined {
    const failingCount = summary.failedCount + summary.invalidCount;
    const attentionCount = summary.blockedCount + failingCount;
    if (attentionCount === 0) {
        return undefined;
    }

    const detailParts = [
        summary.blockedCount > 0 ? formatCount(summary.blockedCount, 'expansion') + ' blocked' : undefined,
        summary.failedCount > 0 ? formatCount(summary.failedCount, 'expansion') + ' failed' : undefined,
        summary.invalidCount > 0 ? formatCount(summary.invalidCount, 'expansion') + ' invalid' : undefined,
    ].filter((part): part is string => part !== undefined);

    const metadata = compactMetadata([
        toMetadata('Resolved', summary.resolvedCount),
        toMetadata('Blocked', summary.blockedCount),
        toMetadata('Failed', summary.failedCount),
        toMetadata('Invalid', summary.invalidCount),
        toMetadata('Omitted', summary.omittedCount),
    ]);

    return {
        tone: failingCount > 0 ? 'error' : 'warning',
        title: 'Dynamic skill context needs attention',
        detail: `${detailParts.join(', ')}. Review dynamic skill approvals or source definitions before relying on this context.`,
        ...(metadata ? { metadata } : {}),
    };
}

function buildReadGuardDiagnostic(preview: RunContractPreview): OperatorDiagnosticViewModel | undefined {
    const blockedCount = preview.attachmentSummary.readGuardBlockedCount ?? 0;
    if (blockedCount === 0) {
        return undefined;
    }

    const reasonMetadata = Object.entries(preview.attachmentSummary.readGuardDecisionReasons ?? {})
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => ({
            label: formatDelimitedLabel(reason),
            value: String(count),
        }));

    const metadata = reasonMetadata.length > 0 ? reasonMetadata : undefined;

    return {
        tone: 'warning',
        title: 'Some attachments were blocked by file-read policy',
        detail: `${formatCount(blockedCount, 'attachment')} blocked before model-visible ingestion. Profile file-read overrides can change allowed file categories, but secret-like files stay blocked by default.`,
        ...(metadata ? { metadata } : {}),
    };
}

function buildDiffDiagnostic(items: RunContractDiffItem[]): OperatorDiagnosticViewModel | undefined {
    const materialItems = items.filter((item) => item.material);
    if (materialItems.length === 0) {
        return undefined;
    }

    return {
        tone: 'warning',
        title: 'Run contract changed before execution',
        detail: 'Review material drift before this queued run resumes.',
        metadata: materialItems.slice(0, 4).map((item) => ({
            label: item.field,
            value: item.reason,
        })),
        actionLabel: 'Accept Contract',
    };
}

function buildSandboxDiagnostic(diagnostic: SandboxDiagnostic): OperatorDiagnosticViewModel {
    return {
        tone: diagnostic.severity === 'error' ? 'error' : diagnostic.severity === 'warning' ? 'warning' : 'info',
        title: diagnostic.failClosed ? 'Sandbox policy can block execution' : 'Sandbox policy notice',
        detail: diagnostic.message,
        metadata: [
            {
                label: 'Code',
                value: diagnostic.code,
            },
            {
                label: 'Fail closed',
                value: diagnostic.failClosed ? 'yes' : 'no',
            },
        ],
    };
}

function buildSandboxPolicyDiagnostics(preview: RunContractPreview): OperatorDiagnosticViewModel[] {
    return (preview.sandboxPolicySummary?.diagnostics ?? [])
        .filter((diagnostic) => diagnostic.severity !== 'info' || diagnostic.failClosed)
        .map(buildSandboxDiagnostic);
}

export function buildRunContractPreviewDiagnostics(preview: RunContractPreview): OperatorDiagnosticViewModel[] {
    const diagnostics: OperatorDiagnosticViewModel[] = [];
    const dynamicDiagnostic = buildDynamicExpansionDiagnostic(preview.dynamicExpansionSummary);
    const readGuardDiagnostic = buildReadGuardDiagnostic(preview);
    const diffDiagnostic = preview.diffFromLastCompatible?.hasMaterialChanges
        ? buildDiffDiagnostic(preview.diffFromLastCompatible.items)
        : undefined;

    if (dynamicDiagnostic) {
        diagnostics.push(dynamicDiagnostic);
    }
    if (readGuardDiagnostic) {
        diagnostics.push(readGuardDiagnostic);
    }
    for (const document of preview.documentSummary ?? []) {
        const documentDiagnostic = buildDocumentDiagnostic(document);
        if (documentDiagnostic) {
            diagnostics.push(documentDiagnostic);
        }
    }
    if (diffDiagnostic) {
        diagnostics.push(diffDiagnostic);
    }
    diagnostics.push(...buildSandboxPolicyDiagnostics(preview));

    return diagnostics;
}

export function buildRunContractUnavailableDiagnostic(message: string | undefined): OperatorDiagnosticViewModel {
    return {
        tone: 'warning',
        title: 'Run contract preview unavailable',
        detail: message ?? 'Run contract preview is unavailable for the current draft.',
    };
}

export function buildContextSummaryDiagnostics(input: ContextSummaryDiagnosticInput): OperatorDiagnosticViewModel[] {
    const diagnostics: OperatorDiagnosticViewModel[] = [];

    if (input.missingReason === 'missing_model_limits') {
        diagnostics.push({
            tone: 'warning',
            title: 'Model context limit is unknown',
            detail: 'Current thread usage is unavailable because this model has no known context limit yet.',
        });
    } else if (input.missingReason === 'feature_disabled') {
        diagnostics.push({
            tone: 'info',
            title: 'Context management is disabled',
            detail: 'Current thread usage is unavailable because context management is disabled for this profile.',
        });
    } else if (input.missingReason === 'multimodal_counting_unavailable') {
        diagnostics.push({
            tone: 'warning',
            title: 'Image token counting is not available',
            detail: 'Current thread usage is unavailable for image sessions because multimodal token counting is not implemented yet.',
        });
    }

    if (input.blockedDynamicSkillContributorCount > 0) {
        diagnostics.push({
            tone: 'warning',
            title: 'Dynamic skill context is blocked or unresolved',
            detail: `${formatCount(input.blockedDynamicSkillContributorCount, 'dynamic skill contributor')} did not resolve into prepared context.`,
        });
    }

    if (input.contextFeedback) {
        diagnostics.push({
            tone: input.contextFeedback.tone === 'error' ? 'error' : 'info',
            title: input.contextFeedback.tone === 'success' ? 'Context action completed' : 'Context action status',
            detail: input.contextFeedback.message,
        });
    }

    return diagnostics;
}

export function buildOutboxReviewDiagnostics(entry: SessionOutboxEntry): OperatorDiagnosticViewModel[] {
    const diagnostics: OperatorDiagnosticViewModel[] = [];

    if (entry.pausedReason) {
        diagnostics.push({
            tone: entry.state === 'paused_for_review' ? 'warning' : 'info',
            title: entry.state === 'paused_for_review' ? 'Queued run paused for review' : 'Queued run paused',
            detail: entry.pausedReason,
            ...(entry.state === 'paused_for_review' ? { actionLabel: 'Accept Contract' } : {}),
        });
    }

    if (entry.latestRunContract) {
        diagnostics.push(...buildRunContractPreviewDiagnostics(entry.latestRunContract));
    }

    return diagnostics;
}

export function buildRegistryDiscoveryDiagnostics(
    diagnostics: RegistryDiscoveryDiagnostic[]
): OperatorDiagnosticViewModel[] {
    return diagnostics.map((diagnostic) => ({
        tone: diagnostic.severity,
        title: `${formatDelimitedLabel(diagnostic.assetKind)} discovery problem`,
        detail: diagnostic.message,
        metadata: [
            {
                label: 'Code',
                value: diagnostic.code,
            },
            {
                label: 'Path',
                value: diagnostic.relativePath,
            },
        ],
    }));
}

export function buildCloudSessionPrerequisiteDiagnostics(blockers: string[]): OperatorDiagnosticViewModel[] {
    return blockers.map((blocker) => ({
        tone: 'error',
        title: 'Kilo cloud sessions are not ready',
        detail: `${formatDelimitedLabel(blocker)}. Fix the Kilo account or scope prerequisite before browsing or continuing cloud sessions.`,
    }));
}

export function buildCloudSessionSyncBackDiagnostic(
    expectation: CloudSessionSyncBackExpectation
): OperatorDiagnosticViewModel {
    const reason = formatCloudSessionSyncBackExpectationReason(expectation.reason);

    if (expectation.state === 'not_available') {
        return {
            tone: 'info',
            title: 'Remote workspace sync-back is not available',
            detail: `${reason}. Kilo owns remote workspace state and command effects; Neon records local provenance only.`,
        };
    }

    return {
        tone: 'info',
        title: 'Remote workspace sync-back does not apply',
        detail:
            expectation.reason === 'local_fork'
                ? `${reason}. This record is a local fork and stays local.`
                : `${reason}. This record is a remote listing snapshot without a local workspace binding.`,
    };
}

export function buildMemoryTruthDiagnostics(input: MemoryTruthDiagnosticInput): OperatorDiagnosticViewModel[] {
    const diagnostics: OperatorDiagnosticViewModel[] = [];

    if (input.hasConflictingCurrentTruth) {
        diagnostics.push({
            tone: 'warning',
            title: 'Conflicting current truth detected',
            detail: 'Multiple active memories claim current truth for this temporal subject. Review before treating this fact as settled.',
        });
    }

    if (input.currentTruthMemoryId && input.currentTruthMemoryId !== input.memoryId) {
        diagnostics.push({
            tone: 'warning',
            title: 'Current truth resolves elsewhere',
            detail: `Derived memory state resolves current truth to ${input.currentTruthMemoryId}.`,
        });
    }

    return diagnostics;
}

export function buildModePromptWarningDiagnostic(warning: string): OperatorDiagnosticViewModel {
    return {
        tone: 'warning',
        title: 'Prompt change needs care',
        detail: warning,
    };
}
