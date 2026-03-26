import type { ThreadTagRecord } from '@/app/backend/persistence/types';
import type { ProviderControlSnapshot } from '@/app/backend/providers/service/types';
import type {
    ContextBudget,
    ExecutionPreset,
    RuntimeResetTarget,
    StreamEventType,
    ToolCapability,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { SandboxRecord } from '@/app/backend/runtime/contracts/types/sandbox';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

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

export interface RuntimeRegisterWorkspaceRootInput extends ProfileInput {
    absolutePath: string;
    label?: string;
}

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
    providerControl: ProviderControlSnapshot;
    threadTags: ThreadTagRecord[];
    executionPreset: ExecutionPreset;
    workspaceRoots: WorkspaceRootRecord[];
    workspacePreferences: WorkspacePreferenceRecord[];
    sandboxes: SandboxRecord[];
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

export const FACTORY_RESET_CONFIRMATION_TEXT = 'RESET APP DATA';

export interface RuntimeFactoryResetInput {
    confirm: true;
    confirmationText: string;
}

export interface RuntimeResetCounts {
    settings: number;
    appContextSettings: number;
    appPromptLayerSettings: number;
    builtInModePromptOverrides: number;
    profileContextSettings: number;
    sessionContextCompactions: number;
    modelLimitOverrides: number;
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
    providerSecrets: number;
    providerAuthStates: number;
    providerAuthFlows: number;
    providerCatalogModels: number;
    providerDiscoverySnapshots: number;
    kiloModelRoutingPreferences: number;
    mcpServers: number;
    mcpServerTools: number;
    mcpServerEnvSecrets: number;
    profiles: number;
    workspaceRoots: number;
    sandboxes: number;
}

export interface RuntimeResetResult {
    dryRun: boolean;
    target: RuntimeResetTarget;
    applied: boolean;
    counts: RuntimeResetCounts;
}

export interface RuntimeFactoryResetCleanupCounts {
    providerSecrets: number;
    managedSandboxEntries: number;
    globalAssetEntries: number;
    logEntries: number;
}

export interface RuntimeFactoryResetResult {
    applied: boolean;
    counts: RuntimeResetCounts;
    cleanupCounts: RuntimeFactoryResetCleanupCounts;
    resetProfileId: string;
}

export interface RuntimeRegisterWorkspaceRootResult {
    workspaceRoot: WorkspaceRootRecord;
}

export interface ContextBudgetInput {
    contextBudget: ContextBudget;
}

export const workspacePreferredVcsValues = ['auto', 'jj', 'git'] as const;
export type WorkspacePreferredVcs = (typeof workspacePreferredVcsValues)[number];

export const workspacePreferredPackageManagerValues = ['auto', 'pnpm', 'npm', 'yarn', 'bun'] as const;
export type WorkspacePreferredPackageManager = (typeof workspacePreferredPackageManagerValues)[number];

export type WorkspaceDetectedVcs = 'jj' | 'git' | 'unknown';
export type WorkspaceDetectedPackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
export type WorkspaceDetectedRuntimeFamily = 'node' | 'python' | 'unknown';
export type WorkspaceDetectedScriptRunner = 'tsx' | 'node' | 'python' | 'unknown';

export interface WorkspaceEnvironmentMarkers {
    hasJjDirectory: boolean;
    hasGitDirectory: boolean;
    hasPackageJson: boolean;
    hasPnpmLock: boolean;
    hasPackageLock: boolean;
    hasYarnLock: boolean;
    hasBunLock: boolean;
    hasTsconfigJson: boolean;
    hasPyprojectToml: boolean;
    hasRequirementsTxt: boolean;
}

export interface WorkspaceEnvironmentCommandAvailabilityEntry {
    available: boolean;
    executablePath?: string;
}

export interface WorkspaceEnvironmentCommandAvailability {
    jj: WorkspaceEnvironmentCommandAvailabilityEntry;
    git: WorkspaceEnvironmentCommandAvailabilityEntry;
    node: WorkspaceEnvironmentCommandAvailabilityEntry;
    python: WorkspaceEnvironmentCommandAvailabilityEntry;
    python3: WorkspaceEnvironmentCommandAvailabilityEntry;
    pnpm: WorkspaceEnvironmentCommandAvailabilityEntry;
    npm: WorkspaceEnvironmentCommandAvailabilityEntry;
    yarn: WorkspaceEnvironmentCommandAvailabilityEntry;
    bun: WorkspaceEnvironmentCommandAvailabilityEntry;
    tsx: WorkspaceEnvironmentCommandAvailabilityEntry;
}

export interface WorkspaceEnvironmentDetectedPreferences {
    vcs: WorkspaceDetectedVcs;
    packageManager: WorkspaceDetectedPackageManager;
    runtime: WorkspaceDetectedRuntimeFamily;
    scriptRunner: WorkspaceDetectedScriptRunner;
}

export interface WorkspaceEnvironmentResolvedPreference<TFamily extends string, TOverride extends string> {
    family: TFamily | 'unknown';
    source: 'detected' | 'override';
    requestedOverride: TOverride;
    available: boolean;
    mismatch: boolean;
}

export interface WorkspaceEnvironmentEffectivePreferences {
    vcs: WorkspaceEnvironmentResolvedPreference<Exclude<WorkspacePreferredVcs, 'auto'>, WorkspacePreferredVcs>;
    packageManager: WorkspaceEnvironmentResolvedPreference<
        Exclude<WorkspacePreferredPackageManager, 'auto'>,
        WorkspacePreferredPackageManager
    >;
    runtime: WorkspaceDetectedRuntimeFamily;
    scriptRunner: WorkspaceDetectedScriptRunner;
}

export interface WorkspaceEnvironmentOverrides {
    preferredVcs: WorkspacePreferredVcs;
    preferredPackageManager: WorkspacePreferredPackageManager;
}

export interface WorkspaceEnvironmentSnapshot {
    platform: 'win32' | 'darwin' | 'linux';
    shellFamily: 'powershell' | 'posix_sh';
    workspaceRootPath: string;
    baseWorkspaceRootPath?: string;
    markers: WorkspaceEnvironmentMarkers;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
    detectedPreferences: WorkspaceEnvironmentDetectedPreferences;
    effectivePreferences: WorkspaceEnvironmentEffectivePreferences;
    overrides: WorkspaceEnvironmentOverrides;
    notes: string[];
}

export interface WorkspacePreferenceRecord {
    profileId: string;
    workspaceFingerprint: string;
    defaultTopLevelTab?: TopLevelTab;
    defaultProviderId?: RuntimeProviderId;
    defaultModelId?: string;
    preferredVcs?: WorkspacePreferredVcs;
    preferredPackageManager?: WorkspacePreferredPackageManager;
    updatedAt: string;
}

export interface RuntimeSetWorkspacePreferenceInput extends ProfileInput {
    workspaceFingerprint: string;
    defaultTopLevelTab?: TopLevelTab;
    defaultProviderId?: RuntimeProviderId;
    defaultModelId?: string;
    preferredVcs?: WorkspacePreferredVcs;
    preferredPackageManager?: WorkspacePreferredPackageManager;
}

export interface RuntimeSetWorkspacePreferenceResult {
    workspacePreference: WorkspacePreferenceRecord;
}

export type RuntimeInspectWorkspaceEnvironmentInput =
    | (ProfileInput & {
          workspaceFingerprint: string;
          absolutePath?: undefined;
      })
    | (ProfileInput & {
          absolutePath: string;
          workspaceFingerprint?: undefined;
      });

export interface RuntimeInspectWorkspaceEnvironmentResult {
    snapshot: WorkspaceEnvironmentSnapshot;
}
