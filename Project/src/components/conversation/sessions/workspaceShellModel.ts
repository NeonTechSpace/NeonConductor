import type { RunRecord, SessionSummaryRecord } from '@/app/backend/persistence/types';

import type { EntityId, OrchestratorExecutionStrategy } from '@/shared/contracts';

import type { ReactNode } from 'react';

export type WorkspaceInspectorSectionId =
    | 'workspace-status'
    | 'execution-environment'
    | 'plan-and-orchestration'
    | 'cloud-sessions'
    | 'run-changes'
    | 'execution-receipt'
    | 'selected-outbox-entry'
    | 'pending-permissions'
    | 'context-assets'
    | 'memory'
    | 'checkpoints';

export interface WorkspaceStripChip {
    id: string;
    label: string;
    detail: string;
    selected: boolean;
}

export interface WorkspaceInspectorSection {
    id: WorkspaceInspectorSectionId;
    label: string;
    description: string;
    content: ReactNode;
    badge?: string;
    tone?: 'default' | 'attention';
}

export interface WorkspaceHeaderModel {
    sessions: SessionSummaryRecord[];
    runs: RunRecord[];
    selectedSession: SessionSummaryRecord | undefined;
    selectedRun: RunRecord | undefined;
    compactConnectionLabel?: string;
    routingBadge?: string;
    pendingPermissionCount: number;
}

export interface WorkspaceInspectorModel {
    sections: WorkspaceInspectorSection[];
}

export interface ChildLaneSelectionModel {
    threadId: EntityId<'thr'>;
    sessionId?: EntityId<'sess'>;
    runId?: EntityId<'run'>;
}

export interface OrchestratorWorkspaceProjection {
    isRootOrchestratorThread: boolean;
    canConfigureExecutionStrategy: boolean;
    selectedExecutionStrategy: OrchestratorExecutionStrategy;
    childLaneSelections: ChildLaneSelectionModel[];
}

export interface WorkspaceShellProjection {
    header: WorkspaceHeaderModel;
    inspector: WorkspaceInspectorModel;
    orchestrator?: OrchestratorWorkspaceProjection;
}
