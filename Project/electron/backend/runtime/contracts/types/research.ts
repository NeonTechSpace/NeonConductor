import type { RuntimeProviderId } from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export const researchCheckoutRootPolicies = ['os_temp', 'custom_path', 'current_workspace'] as const;
export type ResearchCheckoutRootPolicy = (typeof researchCheckoutRootPolicies)[number];

export interface ResearchCheckoutRootSettings {
    profileId: string;
    policy: ResearchCheckoutRootPolicy;
    customAbsolutePath?: string;
    updatedAt: string;
}

export interface RuntimeSetResearchCheckoutRootSettingsInput extends ProfileInput {
    policy: ResearchCheckoutRootPolicy;
    customAbsolutePath?: string;
}

export interface RuntimeGetResearchCheckoutRootSettingsResult {
    settings: ResearchCheckoutRootSettings;
}

export interface RuntimeSetResearchCheckoutRootSettingsResult {
    settings: ResearchCheckoutRootSettings;
}

export type ResearchTargetKind =
    | {
          kind: 'default_branch';
      }
    | {
          kind: 'branch';
          name: string;
      }
    | {
          kind: 'pull_request';
          id: string;
      }
    | {
          kind: 'commit';
          sha: string;
      };

export const repoMutationIntents = ['inspect', 'commit', 'push'] as const;
export type RepoMutationIntent = (typeof repoMutationIntents)[number];

export interface ResearchTargetRequest {
    repoUrl: string;
    requestedTarget?: ResearchTargetKind;
    mutationIntent?: RepoMutationIntent;
}

export type ResearchCheckoutAction = 'reuse_existing' | 'clone_required';
export type ResearchCheckoutUpdateAction = 'none' | 'fetch_only' | 'fast_forward' | 'pause_for_review' | 'unavailable';
export type ResearchCheckoutTargetSwitchAction =
    | 'none'
    | 'checkout_branch'
    | 'checkout_commit'
    | 'checkout_pull_request'
    | 'pause_for_review';
export type RepoVcsFamily = 'git' | 'jj' | 'unknown';

export interface ResearchRepoLocator {
    canonicalKey: string;
    sanitizedUrl: string;
    host?: string;
    owner?: string;
    name: string;
}

export interface RepoWorkflowState {
    family: RepoVcsFamily;
    status: 'missing' | 'clean' | 'dirty' | 'diverged' | 'unknown';
    branch?: string;
    detached: boolean;
    remoteAvailable: boolean;
    syncStatus: 'up_to_date' | 'ahead' | 'behind' | 'diverged' | 'unknown' | 'not_applicable';
    prAssociation?: string;
    explanation: string;
}

export interface RepoMutationGuardrail {
    intent: RepoMutationIntent;
    outcome: 'safe_to_proceed' | 'blocked' | 'approval_required' | 'warned';
    reason: string;
}

export interface RunResearchTarget {
    requested: ResearchTargetRequest;
    locator: ResearchRepoLocator;
    checkoutRecordId?: EntityId<'rch'>;
    rootPolicy: ResearchCheckoutRootPolicy;
    rootAbsolutePath: string;
    resolvedCheckoutPath: string;
    checkoutAction: ResearchCheckoutAction;
    updateAction: ResearchCheckoutUpdateAction;
    targetSwitchAction: ResearchCheckoutTargetSwitchAction;
    detectedVcs: RepoVcsFamily;
    effectiveVcs: RepoVcsFamily;
    repoWorkflowState: RepoWorkflowState;
    mutationGuardrail: RepoMutationGuardrail;
    explanation: string;
    updatedAt: string;
}

export interface RuntimePreviewResearchTargetInput extends ProfileInput {
    sessionId?: EntityId<'sess'>;
    workspaceFingerprint?: string;
    target: ResearchTargetRequest;
}

export interface RuntimePreviewResearchTargetResult {
    researchTarget: RunResearchTarget;
}

export interface RuntimeRepoCommitInput extends ProfileInput {
    researchCheckoutRecordId: EntityId<'rch'>;
    message: string;
    selectedPaths?: string[];
}

export interface RuntimeApplyRepoCommitInput extends RuntimeRepoCommitInput {
    expectedCommitDigest: string;
}

export type RepoChangedFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unknown';

export interface RepoChangedFileEntry {
    relativePath: string;
    status: RepoChangedFileStatus;
    staged: boolean;
    selectable: boolean;
}

export interface RepoCommitChangeSummary {
    changedFileCount: number;
    changedPathSamples: string[];
    files: RepoChangedFileEntry[];
    selectedPathCount: number;
}

export interface RepoCommitCommandReceipt {
    command: 'git commit' | 'jj describe' | 'git push';
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}

export interface RuntimePreviewRepoCommitResult {
    available: boolean;
    guardrail: RepoMutationGuardrail;
    vcsFamily: RepoVcsFamily;
    researchCheckoutRecordId: EntityId<'rch'>;
    resolvedCheckoutPath: string;
    changeSummary: RepoCommitChangeSummary;
    expectedCommitDigest?: string;
}

export interface RuntimeApplyRepoCommitResult {
    committed: boolean;
    guardrail: RepoMutationGuardrail;
    vcsFamily: RepoVcsFamily;
    researchCheckoutRecordId: EntityId<'rch'>;
    resolvedCheckoutPath: string;
    changeSummary: RepoCommitChangeSummary;
    revisionId?: string;
    receipt: RepoCommitCommandReceipt;
}

export interface RuntimeRepoPushInput extends ProfileInput {
    researchCheckoutRecordId: EntityId<'rch'>;
}

export interface RuntimeApplyRepoPushInput extends RuntimeRepoPushInput {
    expectedPushDigest: string;
}

export interface RuntimePreviewRepoPushResult {
    available: boolean;
    guardrail: RepoMutationGuardrail;
    vcsFamily: RepoVcsFamily;
    researchCheckoutRecordId: EntityId<'rch'>;
    resolvedCheckoutPath: string;
    branch?: string;
    upstream?: string;
    aheadCount?: number;
    expectedPushDigest?: string;
}

export interface RuntimeApplyRepoPushResult {
    pushed: boolean;
    guardrail: RepoMutationGuardrail;
    vcsFamily: RepoVcsFamily;
    researchCheckoutRecordId: EntityId<'rch'>;
    resolvedCheckoutPath: string;
    branch?: string;
    upstream?: string;
    aheadCount?: number;
    receipt: RepoCommitCommandReceipt;
}

export const repoGeneratedDraftKinds = ['commit_message', 'pr_title'] as const;
export type RepoGeneratedDraftKind = (typeof repoGeneratedDraftKinds)[number];

export interface RuntimeGenerateRepoTextDraftInput extends RuntimeRepoCommitInput {
    draftKind: RepoGeneratedDraftKind;
    providerId?: RuntimeProviderId;
    modelId?: string;
}

export interface RuntimeGenerateRepoTextDraftResult {
    available: boolean;
    draftKind: RepoGeneratedDraftKind;
    text?: string;
    reason?: string;
    source?: 'utility' | 'fallback';
}
