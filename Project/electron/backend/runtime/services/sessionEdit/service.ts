import { messageStore, sessionStore } from '@/app/backend/persistence/stores';
import type { EntityId, RuntimeRunOptions, SessionEditInput } from '@/app/backend/runtime/contracts';
import { runExecutionService } from '@/app/backend/runtime/services/runExecution/service';

const DEFAULT_RUNTIME_OPTIONS: RuntimeRunOptions = {
    reasoning: {
        effort: 'medium',
        summary: 'auto',
        includeEncrypted: true,
    },
    cache: {
        strategy: 'auto',
    },
    transport: {
        openai: 'auto',
    },
};

const DEFAULT_MODE_BY_TAB = {
    chat: 'chat',
    agent: 'code',
    orchestrator: 'orchestrate',
} as const;

type SessionEditFailureReason =
    | 'message_not_found'
    | 'message_not_editable'
    | 'session_not_found'
    | 'run_not_found'
    | 'no_turns'
    | 'auto_start_required'
    | 'run_start_rejected'
    | 'thread_tab_mismatch';

export type SessionEditResult =
    | {
          edited: false;
          reason: SessionEditFailureReason;
          sessionId?: EntityId<'sess'>;
      }
    | {
          edited: true;
          editMode: SessionEditInput['editMode'];
          sourceSessionId: EntityId<'sess'>;
          sessionId: EntityId<'sess'>;
          sourceThreadId?: string;
          threadId?: string;
          topLevelTab?: 'chat' | 'agent' | 'orchestrator';
          started: boolean;
          runId?: EntityId<'run'>;
          runStatus?: 'running' | 'completed' | 'aborted' | 'error' | 'idle';
      };

export class SessionEditService {
    async edit(input: SessionEditInput): Promise<SessionEditResult> {
        const target = await messageStore.getEditableUserMessageTarget({
            profileId: input.profileId,
            sessionId: input.sessionId,
            messageId: input.messageId,
        });
        if (!target.found) {
            return {
                edited: false,
                reason: target.reason === 'not_found' ? 'message_not_found' : 'message_not_editable',
            };
        }

        let workingSessionId: EntityId<'sess'>;
        let sourceThreadId: string | undefined;
        let threadId: string | undefined;
        let threadTopLevelTab: 'chat' | 'agent' | 'orchestrator' | undefined;
        if (input.editMode === 'truncate') {
            const truncated = await sessionStore.truncateFromRun(input.profileId, input.sessionId, target.runId);
            if (!truncated.truncated) {
                return {
                    edited: false,
                    reason:
                        truncated.reason === 'run_not_found'
                            ? 'run_not_found'
                            : truncated.reason === 'session_not_found'
                              ? 'session_not_found'
                              : 'no_turns',
                };
            }
            workingSessionId = truncated.session.id;
        } else {
            const branched = await sessionStore.createBranchFromRun(input.profileId, input.sessionId, target.runId);
            if (!branched.branched) {
                return {
                    edited: false,
                    reason: branched.reason === 'run_not_found' ? 'run_not_found' : 'session_not_found',
                };
            }
            workingSessionId = branched.session.id;
            sourceThreadId = branched.sourceThreadId;
            threadId = branched.thread.id;
            threadTopLevelTab = branched.thread.topLevelTab;
        }

        const autoStartRun = input.autoStartRun ?? true;
        if (!autoStartRun) {
            return {
                edited: false,
                reason: 'auto_start_required',
                sessionId: workingSessionId,
            };
        }

        const started = await runExecutionService.startRun({
            profileId: input.profileId,
            sessionId: workingSessionId,
            prompt: input.replacementText,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey ?? DEFAULT_MODE_BY_TAB[input.topLevelTab],
            runtimeOptions: input.runtimeOptions ?? DEFAULT_RUNTIME_OPTIONS,
            ...(input.providerId ? { providerId: input.providerId } : {}),
            ...(input.modelId ? { modelId: input.modelId } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        if (!started.accepted) {
            return {
                edited: false,
                reason: 'run_start_rejected',
                sessionId: workingSessionId,
            };
        }

        return {
            edited: true,
            editMode: input.editMode,
            sourceSessionId: input.sessionId,
            sessionId: workingSessionId,
            ...(sourceThreadId ? { sourceThreadId } : {}),
            ...(threadId ? { threadId } : {}),
            ...(threadTopLevelTab ? { topLevelTab: threadTopLevelTab } : {}),
            started: true,
            runId: started.runId,
            runStatus: started.runStatus,
        };
    }
}

export const sessionEditService = new SessionEditService();
