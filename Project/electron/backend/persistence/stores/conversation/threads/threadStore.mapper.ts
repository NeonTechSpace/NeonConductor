import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import type { ThreadListRecord, ThreadRecord } from '@/app/backend/persistence/types';
import { executionEnvironmentModes, topLevelTabs } from '@/app/backend/runtime/contracts';

export interface ThreadRow {
    id: string;
    profile_id: string;
    conversation_id: string;
    title: string;
    top_level_tab: string;
    parent_thread_id: string | null;
    root_thread_id: string;
    delegated_from_orchestrator_run_id: string | null;
    is_favorite: 0 | 1;
    execution_environment_mode: string;
    sandbox_id: string | null;
    last_assistant_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface ThreadListRow extends ThreadRow {
    scope: string;
    workspace_fingerprint: string | null;
    session_count: number;
    latest_session_updated_at: string | null;
}

export function mapThreadRecord(row: ThreadRow): ThreadRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        conversationId: row.conversation_id,
        title: row.title,
        topLevelTab: parseEnumValue(row.top_level_tab, 'threads.top_level_tab', topLevelTabs),
        ...(row.parent_thread_id ? { parentThreadId: row.parent_thread_id } : {}),
        rootThreadId: row.root_thread_id,
        ...(row.delegated_from_orchestrator_run_id
            ? {
                  delegatedFromOrchestratorRunId: parseEntityId(
                      row.delegated_from_orchestrator_run_id,
                      'threads.delegated_from_orchestrator_run_id',
                      'orch'
                  ),
              }
            : {}),
        isFavorite: row.is_favorite === 1,
        executionEnvironmentMode: parseEnumValue(
            row.execution_environment_mode,
            'threads.execution_environment_mode',
            executionEnvironmentModes
        ),
        ...(row.sandbox_id ? { sandboxId: parseEntityId(row.sandbox_id, 'threads.sandbox_id', 'sb') } : {}),
        ...(row.last_assistant_at ? { lastAssistantAt: row.last_assistant_at } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function mapThreadListRecord(row: ThreadListRow): ThreadListRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        conversationId: row.conversation_id,
        title: row.title,
        topLevelTab: parseEnumValue(row.top_level_tab, 'threads.top_level_tab', topLevelTabs),
        ...(row.parent_thread_id ? { parentThreadId: row.parent_thread_id } : {}),
        rootThreadId: row.root_thread_id,
        ...(row.delegated_from_orchestrator_run_id
            ? {
                  delegatedFromOrchestratorRunId: parseEntityId(
                      row.delegated_from_orchestrator_run_id,
                      'threads.delegated_from_orchestrator_run_id',
                      'orch'
                  ),
              }
            : {}),
        isFavorite: row.is_favorite === 1,
        executionEnvironmentMode: parseEnumValue(
            row.execution_environment_mode,
            'threads.execution_environment_mode',
            executionEnvironmentModes
        ),
        ...(row.sandbox_id ? { sandboxId: parseEntityId(row.sandbox_id, 'threads.sandbox_id', 'sb') } : {}),
        ...(row.last_assistant_at ? { lastAssistantAt: row.last_assistant_at } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        scope: row.scope === 'workspace' ? 'workspace' : 'detached',
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        anchorKind: row.scope === 'workspace' ? 'workspace' : 'playground',
        ...(row.scope === 'workspace'
            ? { anchorId: row.workspace_fingerprint ?? 'unknown-workspace' }
            : { anchorId: 'playground' }),
        sessionCount: row.session_count,
        ...(row.latest_session_updated_at ? { latestSessionUpdatedAt: row.latest_session_updated_at } : {}),
    };
}
