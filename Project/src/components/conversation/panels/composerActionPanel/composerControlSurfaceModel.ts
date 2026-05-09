import type { PendingDocumentCardView } from '@/web/components/conversation/panels/composerActionPanel/pendingDocumentsList';
import type { PendingImageCardView } from '@/web/components/conversation/panels/composerActionPanel/pendingImagesGrid';
import type { PendingTextFileCardView } from '@/web/components/conversation/panels/composerActionPanel/pendingTextFilesList';
import type { WorkspaceInspectorSectionId } from '@/web/components/conversation/sessions/workspaceShellModel';
import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';

import type {
    BrowserContextSummary,
    ComposerAttachmentInput,
    RulesetDefinition,
    RuntimeReasoningEffort,
    SkillfileDefinition,
} from '@/shared/contracts';

export type ComposerControlSurfaceItemId =
    | 'files'
    | 'context-assets'
    | 'browser-context'
    | 'terminal-context'
    | 'model-role'
    | 'approvals'
    | 'questions'
    | 'run-intent';

export type ComposerControlSurfaceAction =
    | { kind: 'open-file-picker' }
    | { kind: 'open-browser-surface' }
    | { kind: 'open-inspector-section'; sectionId: WorkspaceInspectorSectionId };

export interface ComposerPlanControlSummary {
    status: 'none' | 'awaiting_answers' | 'draft' | 'approved' | 'implementing' | 'implemented' | 'failed' | 'cancelled';
    requiredQuestionCount: number;
    unansweredRequiredQuestionCount: number;
    optionalQuestionCount: number;
}

export interface ComposerControlSurfaceItem {
    id: ComposerControlSurfaceItemId;
    label: string;
    value: string;
    detail: string;
    tone: 'default' | 'muted' | 'attention' | 'success';
    ariaLabel: string;
    action?: ComposerControlSurfaceAction;
    disabled?: boolean;
}

export interface ComposerControlSurfaceModel {
    items: ComposerControlSurfaceItem[];
}

export interface BuildComposerControlSurfaceModelInput extends AttachmentInput {
    attachedRules: RulesetDefinition[];
    missingAttachedRuleKeys: string[];
    attachedSkills: SkillfileDefinition[];
    missingAttachedSkillKeys: string[];
    inspectorSectionIds: WorkspaceInspectorSectionId[];
    browserContextSummary?: BrowserContextSummary;
    canOpenBrowserSurface: boolean;
    selectedProviderId?: string;
    selectedModelId?: string;
    modelOptions: ModelPickerOption[];
    activeModeKey: string;
    activeModeLabel?: string;
    reasoningEffort: RuntimeReasoningEffort;
    pendingPermissionCount: number;
    planControlSummary?: ComposerPlanControlSummary;
    showRunContractPreview: boolean;
    canQueuePrompt: boolean;
    isSubmitting: boolean;
}

interface AttachmentInput {
    pendingImages: PendingImageCardView[];
    pendingTextFiles: PendingTextFileCardView[];
    pendingDocuments: PendingDocumentCardView[];
    readyComposerAttachments: ComposerAttachmentInput[];
    hasBlockingPendingAttachments: boolean;
}

function pluralize(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural;
}

function hasInspectorSection(input: BuildComposerControlSurfaceModelInput, sectionId: WorkspaceInspectorSectionId): boolean {
    return input.inspectorSectionIds.includes(sectionId);
}

function buildFilesItem(input: BuildComposerControlSurfaceModelInput): ComposerControlSurfaceItem {
    const pendingCount = input.pendingImages.length + input.pendingTextFiles.length + input.pendingDocuments.length;
    const readyCount = input.readyComposerAttachments.length;
    const failedCount =
        input.pendingImages.filter((item) => item.status === 'failed').length +
        input.pendingTextFiles.filter((item) => item.status === 'failed').length +
        input.pendingDocuments.filter((item) => item.status === 'failed').length;
    const value =
        pendingCount === 0
            ? 'No files'
            : `${String(readyCount)} ready / ${String(pendingCount)} ${pluralize(pendingCount, 'file', 'files')}`;
    const detail =
        failedCount > 0
            ? `${String(failedCount)} ${pluralize(failedCount, 'attachment needs', 'attachments need')} attention.`
            : input.hasBlockingPendingAttachments
              ? 'Attachments are still preparing.'
              : pendingCount > 0
                ? 'Ready files flow through run contracts and receipts.'
                : 'Attach files through the existing guarded attachment path.';

    return {
        id: 'files',
        label: 'Files',
        value,
        detail,
        tone: failedCount > 0 || input.hasBlockingPendingAttachments ? 'attention' : pendingCount > 0 ? 'success' : 'muted',
        ariaLabel: `Files: ${value}. ${detail}`,
        action: { kind: 'open-file-picker' },
    };
}

function buildContextAssetsItem(input: BuildComposerControlSurfaceModelInput): ComposerControlSurfaceItem {
    const assetCount = input.attachedRules.length + input.attachedSkills.length;
    const missingCount = input.missingAttachedRuleKeys.length + input.missingAttachedSkillKeys.length;
    const sectionAvailable = hasInspectorSection(input, 'context-assets');
    const value =
        assetCount === 0
            ? 'No assets'
            : `${String(input.attachedRules.length)} rules / ${String(input.attachedSkills.length)} skills`;
    const detail =
        missingCount > 0
            ? `${String(missingCount)} unresolved attached ${pluralize(missingCount, 'asset', 'assets')}.`
            : sectionAvailable
              ? 'Manual rules and skills stay explicit per session.'
              : 'Context assets are available for agent and orchestrator sessions.';

    return {
        id: 'context-assets',
        label: 'Context Assets',
        value,
        detail,
        tone: missingCount > 0 ? 'attention' : assetCount > 0 ? 'success' : 'muted',
        ariaLabel: `Context assets: ${value}. ${detail}`,
        action: { kind: 'open-inspector-section', sectionId: 'context-assets' },
        disabled: !sectionAvailable,
    };
}

function buildBrowserItem(input: BuildComposerControlSurfaceModelInput): ComposerControlSurfaceItem {
    const summary = input.browserContextSummary;
    const value = summary
        ? `${String(summary.commentCount)} comments / ${String(summary.selectedElementCount)} elements`
        : 'No packet';
    const detail = summary
        ? `${String(summary.captureCount)} captures, ${String(summary.designerDraftCount)} designer drafts.`
        : input.canOpenBrowserSurface
          ? 'Open Browser to stage reviewable context.'
          : 'Select a session to stage browser context.';

    return {
        id: 'browser-context',
        label: 'Browser',
        value,
        detail,
        tone: summary
            ? summary.designDiagnosticErrorCount > 0
                ? 'attention'
                : 'success'
            : 'muted',
        ariaLabel: `Browser context: ${value}. ${detail}`,
        action: { kind: 'open-browser-surface' },
        disabled: !input.canOpenBrowserSurface,
    };
}

function buildTerminalItem(): ComposerControlSurfaceItem {
    return {
        id: 'terminal-context',
        label: 'Terminal',
        value: 'No selection',
        detail: 'Terminal text capture remains Phase 15F.',
        tone: 'muted',
        ariaLabel: 'Terminal context: no selection. Terminal text capture remains Phase 15F.',
    };
}

function findSelectedModelLabel(input: BuildComposerControlSurfaceModelInput): string | undefined {
    if (!input.selectedModelId) {
        return undefined;
    }
    return input.modelOptions.find((option) => option.id === input.selectedModelId)?.label ?? input.selectedModelId;
}

function buildModelRoleItem(input: BuildComposerControlSurfaceModelInput): ComposerControlSurfaceItem {
    const modelLabel = findSelectedModelLabel(input);
    const value = modelLabel ?? 'No model';
    const modeLabel = input.activeModeLabel ?? input.activeModeKey;
    const providerPrefix = input.selectedProviderId ? `${input.selectedProviderId} · ` : '';
    const detail = `${providerPrefix}${modeLabel} · reasoning ${input.reasoningEffort.replaceAll('_', ' ')}`;

    return {
        id: 'model-role',
        label: 'Model / Mode',
        value,
        detail,
        tone: modelLabel ? 'default' : 'attention',
        ariaLabel: `Model and mode: ${value}. ${detail}`,
    };
}

function buildApprovalsItem(input: BuildComposerControlSurfaceModelInput): ComposerControlSurfaceItem {
    const sectionAvailable = hasInspectorSection(input, 'pending-permissions');
    const count = input.pendingPermissionCount;
    const value = count === 0 ? 'None waiting' : `${String(count)} ${pluralize(count, 'approval', 'approvals')}`;
    const detail =
        count === 0
            ? 'Approvals stay in the inspector until needed.'
            : 'Review pending permission requests before continuing.';

    return {
        id: 'approvals',
        label: 'Approvals',
        value,
        detail,
        tone: count > 0 ? 'attention' : 'muted',
        ariaLabel: `Approvals: ${value}. ${detail}`,
        action: { kind: 'open-inspector-section', sectionId: 'pending-permissions' },
        disabled: !sectionAvailable,
    };
}

function buildQuestionsItem(input: BuildComposerControlSurfaceModelInput): ComposerControlSurfaceItem {
    const summary = input.planControlSummary;
    const sectionAvailable = hasInspectorSection(input, 'plan-and-orchestration');
    if (!summary || summary.status === 'none') {
        return {
            id: 'questions',
            label: 'Questions',
            value: 'No active plan',
            detail: 'Plan intake questions appear with planning runs.',
            tone: 'muted',
            ariaLabel: 'Questions: no active plan. Plan intake questions appear with planning runs.',
            action: { kind: 'open-inspector-section', sectionId: 'plan-and-orchestration' },
            disabled: !sectionAvailable,
        };
    }

    const totalQuestions = summary.requiredQuestionCount + summary.optionalQuestionCount;
    const value =
        summary.unansweredRequiredQuestionCount > 0
            ? `${String(summary.unansweredRequiredQuestionCount)} required open`
            : `${String(totalQuestions)} ${pluralize(totalQuestions, 'question', 'questions')}`;
    const detail =
        summary.unansweredRequiredQuestionCount > 0
            ? 'Answer required plan questions before a stronger draft.'
            : `Plan status: ${summary.status.replaceAll('_', ' ')}.`;

    return {
        id: 'questions',
        label: 'Questions',
        value,
        detail,
        tone: summary.unansweredRequiredQuestionCount > 0 ? 'attention' : totalQuestions > 0 ? 'success' : 'muted',
        ariaLabel: `Questions: ${value}. ${detail}`,
        action: { kind: 'open-inspector-section', sectionId: 'plan-and-orchestration' },
        disabled: !sectionAvailable,
    };
}

function buildRunIntentItem(input: BuildComposerControlSurfaceModelInput): ComposerControlSurfaceItem {
    const value = input.isSubmitting ? 'Starting' : input.canQueuePrompt ? 'Start or queue' : 'Start only';
    const detail = input.showRunContractPreview
        ? 'Run contract preview refreshes from the current draft.'
        : 'Planning mode uses plan intake instead of run-contract preview.';

    return {
        id: 'run-intent',
        label: 'Run Intent',
        value,
        detail,
        tone: input.isSubmitting ? 'attention' : 'default',
        ariaLabel: `Run intent: ${value}. ${detail}`,
    };
}

export function buildComposerControlSurfaceModel(
    input: BuildComposerControlSurfaceModelInput
): ComposerControlSurfaceModel {
    return {
        items: [
            buildFilesItem(input),
            buildContextAssetsItem(input),
            buildBrowserItem(input),
            buildTerminalItem(),
            buildModelRoleItem(input),
            buildApprovalsItem(input),
            buildQuestionsItem(input),
            buildRunIntentItem(input),
        ],
    };
}
