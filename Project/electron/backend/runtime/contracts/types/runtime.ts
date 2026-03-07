import type { ProviderModelRecord, ThreadTagRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';
import type {
    ContextBudget,
    ExecutionPreset,
    RuntimeResetTarget,
    StreamEventType,
    ToolCapability,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface StreamEventEnvelope {
    id: EntityId<'evt'>;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    eventType: StreamEventType;
    at: string;
    payload: Record<string, unknown>;
}

export interface RuntimeEventsSubscriptionInput {
    afterSequence?: number;
}

export type RuntimeShellBootstrapInput = ProfileInput;

export interface WorkspaceRootRecord {
    fingerprint: string;
    profileId: string;
    absolutePath: string;
    label: string;
    createdAt: string;
    updatedAt: string;
}

export interface ToolCatalogEntry {
    id: string;
    label: string;
    description: string;
    permissionPolicy: 'ask' | 'allow' | 'deny';
    capabilities: ToolCapability[];
    requiresWorkspace: boolean;
    allowsExternalPaths: boolean;
    allowsIgnoredPaths: boolean;
}

export interface RuntimeShellBootstrap {
    lastSequence: number;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    threadTags: ThreadTagRecord[];
    executionPreset: ExecutionPreset;
    workspaceRoots: WorkspaceRootRecord[];
    defaults: {
        providerId: string;
        modelId: string;
    };
}

export interface WindowStateSubscriptionInput {
    afterSequence?: number;
}

export type RuntimeSnapshotInput = ProfileInput;

export interface RuntimeResetInput {
    target: RuntimeResetTarget;
    profileId?: string;
    workspaceFingerprint?: string;
    dryRun?: boolean;
    confirm?: boolean;
}

export interface RuntimeResetCounts {
    settings: number;
    runtimeEvents: number;
    sessions: number;
    runs: number;
    messages: number;
    messageParts: number;
    runUsage: number;
    permissions: number;
    conversations: number;
    threads: number;
    threadTags: number;
    tags: number;
    diffs: number;
    checkpoints: number;
    modeDefinitions: number;
    rulesets: number;
    skillfiles: number;
    marketplacePackages: number;
    marketplaceAssets: number;
    kiloAccountSnapshots: number;
    kiloOrgSnapshots: number;
    secretReferences: number;
    providerAuthStates: number;
    providerAuthFlows: number;
    providerCatalogModels: number;
    providerDiscoverySnapshots: number;
    kiloModelRoutingPreferences: number;
}

export interface RuntimeResetResult {
    dryRun: boolean;
    target: RuntimeResetTarget;
    applied: boolean;
    counts: RuntimeResetCounts;
}

export interface ContextBudgetInput {
    contextBudget: ContextBudget;
}
