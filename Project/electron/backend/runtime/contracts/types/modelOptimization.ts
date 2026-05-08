import type {
    InternalModelRole,
    ModelFamilyProfileFamily,
    ModelOptimizationWarningSeverity,
    ModelRoleDefaultSource,
    PromptContributorEditability,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';

export interface ModelFamilyProfile {
    id: string;
    family: ModelFamilyProfileFamily;
    label: string;
    runtimeToolProtocol: string;
    compatibleRoles: InternalModelRole[];
    contextStrategy: string;
    promptTemplatePolicy: string;
    unsupportedParameterPolicy: 'fail_closed' | 'omit_with_warning';
}

export interface ModelOptimizationCompatibilityWarning {
    code: string;
    severity: ModelOptimizationWarningSeverity;
    message: string;
}

export interface ModelOptimizationProfile {
    profileId: string;
    familyProfileId: string;
    family: ModelFamilyProfileFamily;
    label: string;
    providerId: RuntimeProviderId;
    modelId: string;
    modelRole: InternalModelRole;
    contextStrategy: string;
    promptTemplatePolicy: string;
    toolProtocol: string;
    unsupportedParameterPolicy: ModelFamilyProfile['unsupportedParameterPolicy'];
    warnings: ModelOptimizationCompatibilityWarning[];
}

export interface ModelRoleDefaultRecord {
    role: InternalModelRole;
    providerId?: RuntimeProviderId;
    modelId?: string;
    source: ModelRoleDefaultSource;
    sourceLabel: string;
    status: 'configured' | 'fallback' | 'unconfigured';
    detail?: string;
}

export interface PromptContributorEditabilityDetails {
    classification: PromptContributorEditability;
    label: string;
    editable: boolean;
    editTarget?: {
        surface: 'prompt_layers' | 'modes' | 'provider_roles' | 'context_controls';
        key: string;
        label: string;
    };
    immutableReason?: string;
}

export interface EffectivePromptPreviewContributor {
    contributorId: string;
    label: string;
    sourceLabel: string;
    checkpoint: string;
    trustLevel: string;
    instructionAuthority: string;
    tokenCount?: number;
    digest: string;
    editability: PromptContributorEditabilityDetails;
}

export interface EffectivePromptPreview {
    contributors: EffectivePromptPreviewContributor[];
    includedContributorCount: number;
    estimatedTokenCount?: number;
    digest: string;
    generatedAtRunId?: EntityId<'run'>;
}
