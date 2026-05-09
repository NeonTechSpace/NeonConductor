import type { ComposerPlanControlSummary } from '@/web/components/conversation/panels/composerActionPanel/composerControlSurfaceModel';
import type { PendingDocumentCardView } from '@/web/components/conversation/panels/composerActionPanel/pendingDocumentsList';
import type { PendingImageCardView } from '@/web/components/conversation/panels/composerActionPanel/pendingImagesGrid';
import type { WorkspaceInspectorSectionId } from '@/web/components/conversation/sessions/workspaceShellModel';
import type { ConversationModeOption } from '@/web/components/conversation/shell/workspace/helpers';
import type { ModelCompatibilityState, ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';

import type {
    BrowserContextPacket,
    BrowserContextSummary,
    ComposerAttachmentInput,
    ComposerExternalContextCaptureInput,
    EntityId,
    ResearchTargetRequest,
    ResolvedContextState,
    RulesetDefinition,
    RuntimeRunOptions,
    RuntimeReasoningEffort,
    SkillfileDefinition,
    TopLevelTab,
} from '@/shared/contracts';
import type { ModelRoleDefaultRecord } from '@/shared/contracts/types/modelOptimization';
import type { ProviderModelFavoriteRecord } from '@/shared/contracts/types/provider';

export type PendingImageView = PendingImageCardView;
export type PendingDocumentView = PendingDocumentCardView;

export interface PendingTextFileView {
    clientId: string;
    fileName: string;
    status: 'reading' | 'ready' | 'failed';
    byteSize?: number;
    errorMessage?: string;
    attachment?: {
        mimeType: string;
        encoding: 'utf-8' | 'utf-8-bom';
    };
}

export interface ComposerActionFeedback {
    message: string;
    tone: 'success' | 'error' | 'info';
}

export interface ComposerActionPanelProps {
    profileId: string;
    pendingImages: PendingImageView[];
    pendingTextFiles: PendingTextFileView[];
    pendingDocuments: PendingDocumentView[];
    externalContextCaptures: ComposerExternalContextCaptureInput[];
    readyComposerAttachments: ComposerAttachmentInput[];
    hasBlockingPendingAttachments: boolean;
    disabled: boolean;
    controlsDisabled?: boolean;
    submitDisabled?: boolean;
    isSubmitting: boolean;
    profiles?: Array<{ id: string; name: string }>;
    selectedProfileId?: string;
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
    topLevelTab: TopLevelTab;
    activeModeKey: string;
    modes: ConversationModeOption[];
    reasoningEffort: RuntimeReasoningEffort;
    selectedModelSupportsReasoning: boolean;
    supportedReasoningEfforts?: RuntimeReasoningEffort[];
    canAttachImages: boolean;
    maxImageAttachmentsPerMessage: number;
    imageAttachmentBlockedReason?: string;
    routingBadge?: string;
    selectedModelCompatibilityState?: ModelCompatibilityState;
    selectedModelCompatibilityReason?: string;
    selectedProviderStatus?: {
        label: string;
        authState: string;
        authMethod: string;
    };
    modelOptions: ModelPickerOption[];
    modelFavorites?: ProviderModelFavoriteRecord[];
    modelRoleDefaults?: ModelRoleDefaultRecord[];
    modelContinuationLockMessage?: string;
    runErrorMessage: string | undefined;
    contextState?: ResolvedContextState;
    browserContext?: BrowserContextPacket;
    browserContextSummary?: BrowserContextSummary;
    selectedSessionId?: EntityId<'sess'>;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    runtimeOptions: RuntimeRunOptions;
    showRunContractPreview?: boolean;
    attachedRules?: RulesetDefinition[];
    missingAttachedRuleKeys?: string[];
    attachedSkills?: SkillfileDefinition[];
    missingAttachedSkillKeys?: string[];
    pendingPermissionCount?: number;
    planControlSummary?: ComposerPlanControlSummary;
    inspectorSectionIds?: WorkspaceInspectorSectionId[];
    canCompactContext?: boolean;
    isCompactingContext?: boolean;
    promptResetKey?: number;
    focusComposerRequestKey?: number;
    onDraftPromptSnapshotChange?: (prompt: string) => void;
    onProfileChange?: (profileId: string) => void;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onToggleModelFavorite?: (option: ModelPickerOption, favorite: boolean) => void;
    onReasoningEffortChange: (effort: RuntimeReasoningEffort) => void;
    onModeChange: (modeKey: string) => void;
    onPromptEdited: () => void;
    onAddFiles: (files: FileList | File[]) => void;
    onRemovePendingImage: (clientId: string) => void;
    onRemovePendingTextFile: (clientId: string) => void;
    onRemovePendingDocument: (clientId: string) => void;
    onAddExternalContextCapture: (capture: ComposerExternalContextCaptureInput) => void;
    onRemoveExternalContextCapture: (clientId: string) => void;
    onRetryPendingImage: (clientId: string) => void;
    onQueuePrompt?: (
        prompt: string,
        browserContext?: BrowserContextPacket,
        researchTarget?: ResearchTargetRequest
    ) => void;
    onSubmitPrompt: (
        prompt: string,
        browserContext?: BrowserContextPacket,
        researchTarget?: ResearchTargetRequest
    ) => void;
    onOpenInspectorSection?: (sectionId: WorkspaceInspectorSectionId) => void;
    onOpenBrowserSurface?: () => void;
    onCompactContext?: () => Promise<ComposerActionFeedback | undefined>;
}

export interface ComposerControlsReadModel {
    composerControlsDisabled: boolean;
    composerSubmitDisabled: boolean;
    shouldShowModePicker: boolean;
    compactConnectionLabel?: string;
    availableReasoningEfforts: Array<{ value: RuntimeReasoningEffort; label: string }>;
    hasAdjustableReasoningEfforts: boolean;
    selectedReasoningEffort: RuntimeReasoningEffort;
    reasoningControlDisabled: boolean;
}

export interface ComposerSubmissionPolicy {
    hasBlockingPendingImages: boolean;
    hasSubmittableContent: boolean;
    hasUnsupportedPendingImages: boolean;
    canSubmit: boolean;
    attachmentStatusMessage: string;
    composerFooterMessage: string;
    composerErrorMessage: string | undefined;
}

export interface ComposerLightboxState {
    imageUrl: string;
    title: string;
    detail?: string;
}
