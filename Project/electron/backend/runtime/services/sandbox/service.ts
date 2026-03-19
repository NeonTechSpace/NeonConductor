import { access } from 'node:fs/promises';

import { conversationStore, threadStore, workspaceRootStore, sandboxStore } from '@/app/backend/persistence/stores';
import type { ThreadRecord, SandboxRecord } from '@/app/backend/persistence/types';
import type {
    SandboxConfigureThreadInput,
    SandboxCreateInput,
    SandboxRefreshResult,
    SandboxRemoveResult,
    SandboxRemoveInput,
    SandboxRemoveOrphanedResult,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    buildManagedSandboxPath,
    createManagedSandbox,
    detectSandboxStatus,
    removeManagedSandbox,
} from '@/app/backend/runtime/services/sandbox/filesystem';

function defaultSandboxLabel(thread: ThreadRecord): string {
    const trimmedTitle = thread.title.trim();
    if (trimmedTitle.length > 0) {
        return trimmedTitle;
    }

    return `Sandbox ${thread.id.slice(0, 8)}`;
}

async function ensureWorkspaceRoot(profileId: string, workspaceFingerprint: string) {
    const workspaceRoot = await workspaceRootStore.getByFingerprint(profileId, workspaceFingerprint);
    if (!workspaceRoot) {
        return errOp('not_found', `Workspace "${workspaceFingerprint}" is not registered.`);
    }

    return okOp(workspaceRoot);
}

export class SandboxService {
    async list(profileId: string, workspaceFingerprint?: string): Promise<SandboxRecord[]> {
        return workspaceFingerprint
            ? sandboxStore.listByWorkspace(profileId, workspaceFingerprint)
            : sandboxStore.listByProfile(profileId);
    }

    async create(input: SandboxCreateInput): Promise<OperationalResult<SandboxRecord>> {
        const workspaceRootResult = await ensureWorkspaceRoot(input.profileId, input.workspaceFingerprint);
        if (workspaceRootResult.isErr()) {
            return errOp(workspaceRootResult.error.code, workspaceRootResult.error.message);
        }

        const workspaceRoot = workspaceRootResult.value;
        const targetPath = buildManagedSandboxPath({
            workspaceLabel: workspaceRoot.label,
            ...(input.sandboxKey ? { sandboxKey: input.sandboxKey } : {}),
        });
        const existing = await sandboxStore.getByAbsolutePath(input.profileId, targetPath);
        if (existing) {
            return okOp(existing);
        }

        const created = await createManagedSandbox({
            workspaceRootPath: workspaceRoot.absolutePath,
            targetPath,
        });
        if (!created.ok) {
            return errOp(created.error.reason === 'workspace_missing' ? 'request_unavailable' : 'request_failed', created.error.detail);
        }

        const record = await sandboxStore.create({
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
            absolutePath: targetPath,
            label: input.label?.trim() || 'Managed sandbox',
            status: 'ready',
            creationStrategy: created.value.strategy,
        });

        return okOp(record);
    }

    async refresh(profileId: string, sandboxId: string): Promise<SandboxRefreshResult> {
        const sandbox = await sandboxStore.getById(profileId, sandboxId);
        if (!sandbox) {
            return {
                refreshed: false,
                reason: 'not_found',
            };
        }

        const status = await detectSandboxStatus(sandbox.absolutePath);
        const refreshed = await sandboxStore.update({
            profileId,
            sandboxId,
            status,
            touchLastUsed: status === 'ready',
        });

        return {
            refreshed: true,
            ...(refreshed ? { sandbox: refreshed } : {}),
        };
    }

    async remove(input: SandboxRemoveInput): Promise<SandboxRemoveResult> {
        const sandbox = await sandboxStore.getById(input.profileId, input.sandboxId);
        if (!sandbox) {
            return { removed: false, reason: 'not_found', affectedThreadIds: [] };
        }
        if (await sandboxStore.hasRunningSession(input.profileId, sandbox.id)) {
            return {
                removed: false,
                reason: 'active_session',
                message: 'Active sessions are still running in this managed sandbox.',
                affectedThreadIds: [],
            };
        }

        const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, sandbox.workspaceFingerprint);
        if (!workspaceRoot) {
            return {
                removed: false,
                reason: 'workspace_unresolved',
                message: 'Base workspace root could not be resolved.',
                affectedThreadIds: [],
            };
        }

        const affectedThreadIds = await threadStore.listIdsBySandbox(input.profileId, sandbox.id);

        try {
            await access(sandbox.absolutePath);
            const removed = await removeManagedSandbox({
                sandboxPath: sandbox.absolutePath,
                removeFiles: input.removeFiles ?? true,
            });
            if (!removed.ok) {
                return {
                    removed: false,
                    reason: 'remove_failed',
                    message: removed.error.detail,
                    affectedThreadIds: [],
                };
            }
        } catch {
            // Missing path still allows record cleanup below.
        }

        await sandboxStore.delete(input.profileId, input.sandboxId);
        return {
            removed: true,
            sandboxId: input.sandboxId,
            affectedThreadIds,
        };
    }

    async removeOrphaned(profileId: string): Promise<SandboxRemoveOrphanedResult> {
        const orphaned = await sandboxStore.listOrphaned(profileId);
        const removedSandboxIds: SandboxRemoveOrphanedResult['removedSandboxIds'] = [];
        const affectedThreadIds: SandboxRemoveOrphanedResult['affectedThreadIds'] = [];

        for (const sandbox of orphaned) {
            const removed = await this.remove({
                profileId,
                sandboxId: sandbox.id,
                removeFiles: true,
            });
            if (removed.removed) {
                removedSandboxIds.push(sandbox.id);
                affectedThreadIds.push(...removed.affectedThreadIds);
            }
        }

        return { removedSandboxIds, affectedThreadIds };
    }

    async configureThread(input: SandboxConfigureThreadInput): Promise<OperationalResult<ThreadRecord>> {
        const thread = await threadStore.getById(input.profileId, input.threadId);
        if (!thread) {
            return errOp('thread_not_found', `Thread "${input.threadId}" was not found.`);
        }

        const bucket = await conversationStore.getBucketById(input.profileId, thread.conversationId);
        if (!bucket || bucket.scope !== 'workspace' || !bucket.workspaceFingerprint) {
            return errOp('not_found', 'Sandbox execution is only available for workspace-bound threads.');
        }
        if (thread.topLevelTab === 'chat') {
            return errOp('unsupported_tab', 'Chat threads use read-only conversation branches and cannot bind sandboxes.');
        }

        if (input.mode === 'sandbox') {
            const sandbox = input.sandboxId ? await sandboxStore.getById(input.profileId, input.sandboxId) : null;
            if (!sandbox || sandbox.workspaceFingerprint !== bucket.workspaceFingerprint) {
                return errOp('not_found', 'Selected managed sandbox was not found for this workspace.');
            }

            const updated = await threadStore.bindSandbox({
                profileId: input.profileId,
                threadId: input.threadId,
                sandboxId: sandbox.id,
            });
            return updated ? okOp(updated) : errOp('thread_not_found', `Thread "${input.threadId}" was not found.`);
        }

        const updated = await threadStore.setExecutionEnvironment({
            profileId: input.profileId,
            threadId: input.threadId,
            mode: input.mode,
        });
        if (!updated) {
            return errOp('thread_not_found', `Thread "${input.threadId}" was not found.`);
        }

        return okOp(updated);
    }

    async materializeThreadSandbox(input: {
        profileId: string;
        thread: ThreadRecord;
        workspaceFingerprint: string;
    }): Promise<OperationalResult<SandboxRecord | null>> {
        if (input.thread.executionEnvironmentMode !== 'new_sandbox') {
            return okOp(null);
        }

        if (input.thread.sandboxId) {
            const existingSandbox = await sandboxStore.getById(input.profileId, input.thread.sandboxId);
            if (existingSandbox) {
                return okOp(existingSandbox);
            }
        }

        const created = await this.create({
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
            sandboxKey: `thread-${input.thread.id}`,
            label: defaultSandboxLabel(input.thread),
        });
        if (created.isErr()) {
            return created;
        }

        const bound = await threadStore.bindSandbox({
            profileId: input.profileId,
            threadId: input.thread.id,
            sandboxId: created.value.id,
        });
        if (!bound) {
            return errOp('thread_not_found', `Thread "${input.thread.id}" was not found.`);
        }

        return okOp(created.value);
    }
}

export const sandboxService = new SandboxService();
