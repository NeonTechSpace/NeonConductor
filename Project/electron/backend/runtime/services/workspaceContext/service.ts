import {
    conversationStore,
    sessionStore,
    threadStore,
    workspaceRootStore,
    sandboxStore,
} from '@/app/backend/persistence/stores';
import type { ThreadRecord } from '@/app/backend/persistence/types';
import type { EntityId, ResolvedWorkspaceContext } from '@/app/backend/runtime/contracts';
import { sandboxService } from '@/app/backend/runtime/services/sandbox/service';

async function resolveWorkspaceBoundContext(input: {
    profileId: string;
    workspaceFingerprint: string;
    thread: ThreadRecord;
    sessionSandboxId?: EntityId<'sb'>;
}): Promise<ResolvedWorkspaceContext> {
    const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, input.workspaceFingerprint);
    if (!workspaceRoot) {
        return {
            kind: 'workspace_unresolved',
            workspaceFingerprint: input.workspaceFingerprint,
            label: input.workspaceFingerprint,
            reason: 'workspace_root_missing',
            executionEnvironmentMode:
                input.thread.executionEnvironmentMode === 'sandbox' ? 'local' : input.thread.executionEnvironmentMode,
        };
    }

    const effectiveSandboxId = input.sessionSandboxId ?? input.thread.sandboxId;
    if (effectiveSandboxId) {
        const sandbox = await sandboxStore.getById(input.profileId, effectiveSandboxId);
        if (sandbox) {
            return {
                kind: 'sandbox',
                workspaceFingerprint: input.workspaceFingerprint,
                label: sandbox.label,
                absolutePath: sandbox.absolutePath,
                executionEnvironmentMode: 'sandbox',
                sandbox,
                baseWorkspace: {
                    label: workspaceRoot.label,
                    absolutePath: workspaceRoot.absolutePath,
                },
            };
        }
    }

    return {
        kind: 'workspace',
        workspaceFingerprint: input.workspaceFingerprint,
        label: workspaceRoot.label,
        absolutePath: workspaceRoot.absolutePath,
        executionEnvironmentMode:
            input.thread.executionEnvironmentMode === 'sandbox' ? 'local' : input.thread.executionEnvironmentMode,
    };
}

export class WorkspaceContextService {
    async resolveForSession(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        topLevelTab?: ThreadRecord['topLevelTab'];
        allowLazySandboxCreation?: boolean;
    }): Promise<ResolvedWorkspaceContext | null> {
        const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
        if (!sessionThread) {
            return null;
        }

        if (sessionThread.scope === 'detached' || !sessionThread.workspaceFingerprint) {
            return { kind: 'detached' };
        }

        let thread = sessionThread.thread;
        let sessionSandboxId = sessionThread.sessionSandboxId;
        if (
            input.allowLazySandboxCreation &&
            thread.executionEnvironmentMode === 'new_sandbox' &&
            thread.topLevelTab !== 'chat'
        ) {
            const created = await sandboxService.materializeThreadSandbox({
                profileId: input.profileId,
                thread,
                workspaceFingerprint: sessionThread.workspaceFingerprint,
            });
            if (created.isOk() && created.value) {
                thread = {
                    ...thread,
                    executionEnvironmentMode: 'sandbox',
                    sandboxId: created.value.id,
                };
                const updatedSession = await sessionStore.setSandboxBinding({
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    sandboxId: created.value.id,
                });
                sessionSandboxId = updatedSession?.sandboxId ?? created.value.id;
            }
        } else if (!sessionSandboxId && thread.sandboxId) {
            const updatedSession = await sessionStore.setSandboxBinding({
                profileId: input.profileId,
                sessionId: input.sessionId,
                sandboxId: thread.sandboxId,
            });
            sessionSandboxId = updatedSession?.sandboxId ?? thread.sandboxId;
        }

        return resolveWorkspaceBoundContext({
            profileId: input.profileId,
            workspaceFingerprint: sessionThread.workspaceFingerprint,
            thread,
            ...(sessionSandboxId ? { sessionSandboxId } : {}),
        });
    }

    async resolveForThread(input: {
        profileId: string;
        threadId: EntityId<'thr'>;
    }): Promise<ResolvedWorkspaceContext | null> {
        const thread = await threadStore.getById(input.profileId, input.threadId);
        if (!thread) {
            return null;
        }

        const bucket = await conversationStore.getBucketById(input.profileId, thread.conversationId);
        if (!bucket || bucket.scope === 'detached' || !bucket.workspaceFingerprint) {
            return { kind: 'detached' };
        }

        return resolveWorkspaceBoundContext({
            profileId: input.profileId,
            workspaceFingerprint: bucket.workspaceFingerprint,
            thread,
        });
    }

    async resolveExplicit(input: {
        profileId: string;
        workspaceFingerprint?: string;
        sandboxId?: EntityId<'sb'>;
    }): Promise<ResolvedWorkspaceContext> {
        if (!input.workspaceFingerprint) {
            return { kind: 'detached' };
        }

        const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, input.workspaceFingerprint);
        if (!workspaceRoot) {
            return {
                kind: 'workspace_unresolved',
                workspaceFingerprint: input.workspaceFingerprint,
                label: input.workspaceFingerprint,
                reason: 'workspace_root_missing',
                executionEnvironmentMode: 'local',
            };
        }

        if (input.sandboxId) {
            const sandbox = await sandboxStore.getById(input.profileId, input.sandboxId);
            if (sandbox) {
                return {
                    kind: 'sandbox',
                    workspaceFingerprint: input.workspaceFingerprint,
                    label: sandbox.label,
                    absolutePath: sandbox.absolutePath,
                    executionEnvironmentMode: 'sandbox',
                    sandbox,
                    baseWorkspace: {
                        label: workspaceRoot.label,
                        absolutePath: workspaceRoot.absolutePath,
                    },
                };
            }
        }

        return {
            kind: 'workspace',
            workspaceFingerprint: input.workspaceFingerprint,
            label: workspaceRoot.label,
            absolutePath: workspaceRoot.absolutePath,
            executionEnvironmentMode: 'local',
        };
    }
}

export const workspaceContextService = new WorkspaceContextService();
