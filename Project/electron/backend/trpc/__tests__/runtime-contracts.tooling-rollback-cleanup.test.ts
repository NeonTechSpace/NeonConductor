import { describe, expect, it, vi } from 'vitest';

import { checkpointChangesetStore, checkpointSnapshotStore, checkpointStore } from '@/app/backend/persistence/stores';
import type { EntityId } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';
import {
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    defaultRuntimeOptions,
    getPersistence,
    mkdtempSync,
    os,
    path,
    readFileSync,
    requireEntityId,
    rmSync,
    waitForRunStatus,
    writeFileSync,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: permissions and tooling', () => {
    const profileId = runtimeContractProfileId;
    it('records unsupported diff artifacts for non-git mutation runs and supports native changeset revert', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-diff-unsupported-'));
        let resolveFetch: (() => void) | undefined;

        vi.stubGlobal(
            'fetch',
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        resolveFetch = () => {
                            resolve({
                                ok: true,
                                status: 200,
                                statusText: 'OK',
                                json: () => ({
                                    choices: [
                                        {
                                            message: {
                                                content: 'mutation complete',
                                            },
                                        },
                                    ],
                                    usage: {
                                        prompt_tokens: 10,
                                        completion_tokens: 20,
                                        total_tokens: 30,
                                    },
                                }),
                            });
                        };
                    })
            )
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-diff-unsupported-key',
        });
        expect(configured.success).toBe(true);

        const thread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Unsupported Diff Thread',
            executionEnvironmentMode: 'local',
        });
        const threadId = requireEntityId(thread.thread.id, 'thr', 'Expected unsupported workspace thread id.');
        const listedThreads = await caller.conversation.listThreads({
            profileId,
            activeTab: 'agent',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            sort: 'latest',
        });
        const workspaceThread = listedThreads.threads.find((item) => item.id === threadId);
        if (!workspaceThread?.workspaceFingerprint) {
            throw new Error('Expected workspace fingerprint for non-git thread.');
        }

        const created = await caller.session.create({
            profileId,
            threadId,
            kind: 'local',
        });
        expect(created.created).toBe(true);
        if (!created.created) {
            throw new Error(`Expected session creation success, received "${created.reason}".`);
        }

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Change notes',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: workspaceThread.workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected non-git mutating run to start.');
        }

        await vi.waitFor(() => {
            expect(resolveFetch).toBeTypeOf('function');
        });
        writeFileSync(path.join(workspacePath, 'notes.txt'), 'new content\n');
        resolveFetch?.();
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const diffs = await caller.diff.listByRun({
            profileId,
            runId: started.runId,
        });
        expect(diffs.diffs).toHaveLength(1);
        const diff = diffs.diffs[0];
        if (!diff) {
            throw new Error('Expected diff artifact even when git capture is unsupported.');
        }
        expect(diffs.overview?.kind).toBe('unsupported');
        expect(diff.artifact.kind).toBe('unsupported');
        if (diff.artifact.kind !== 'unsupported') {
            throw new Error('Expected unsupported diff artifact.');
        }
        expect(diff.artifact.reason).toBe('workspace_not_git');

        const checkpoints = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        expect(checkpoints.checkpoints).toHaveLength(1);
        expect(checkpoints.storage.looseReferencedBlobCount).toBeGreaterThan(0);
        const checkpoint = checkpoints.checkpoints[0];
        expect(checkpoint?.checkpointKind).toBe('auto');
        expect(checkpoint?.snapshotFileCount).toBeGreaterThanOrEqual(0);
        if (!checkpoint) {
            throw new Error('Expected native checkpoint for non-git mutation run.');
        }

        const compacted = await caller.checkpoint.forceCompact({
            profileId,
            sessionId: created.session.id,
            confirm: true,
        });
        expect(compacted.compacted).toBe(true);
        expect(compacted.storage.packedReferencedBlobCount).toBeGreaterThan(0);
        expect(readFileSync(path.join(workspacePath, 'notes.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe(
            'new content\n'
        );

        const preview = await caller.checkpoint.previewRollback({
            profileId,
            checkpointId: checkpoint.id,
        });
        expect(preview.found).toBe(true);
        if (!preview.found) {
            throw new Error('Expected rollback preview for non-git checkpoint.');
        }
        expect(preview.preview.isSharedTarget).toBe(false);
        expect(preview.preview.hasChangeset).toBe(true);
        expect(preview.preview.changeset?.changeCount).toBe(1);
        expect(preview.preview.recommendedAction).toBe('restore_checkpoint');
        expect(preview.preview.canRevertSafely).toBe(true);

        const reverted = await caller.checkpoint.revertChangeset({
            profileId,
            checkpointId: checkpoint.id,
            confirm: true,
        });
        expect(reverted.reverted).toBe(true);
        expect(() => readFileSync(path.join(workspacePath, 'notes.txt'), 'utf8')).toThrow();

        rmSync(workspacePath, { recursive: true, force: true });
    });

    it('captures empty no-op changesets cleanly and blocks revert when there is nothing to undo', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-checkpoint-empty-changeset-'));

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: () => ({
                    choices: [
                        {
                            message: {
                                content: 'no mutation complete',
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 20,
                        total_tokens: 30,
                    },
                }),
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-empty-changeset-key',
        });
        expect(configured.success).toBe(true);

        const thread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Empty Changeset Thread',
        });
        const threadId = requireEntityId(thread.thread.id, 'thr', 'Expected empty changeset thread id.');
        const listedThreads = await caller.conversation.listThreads({
            profileId,
            activeTab: 'agent',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            sort: 'latest',
        });
        const workspaceThread = listedThreads.threads.find((item) => item.id === threadId);
        if (!workspaceThread?.workspaceFingerprint) {
            throw new Error('Expected workspace fingerprint for empty changeset thread.');
        }

        const created = await caller.session.create({
            profileId,
            threadId,
            kind: 'local',
        });
        if (!created.created) {
            throw new Error(`Expected session creation success, received "${created.reason}".`);
        }

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Do not change files',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: workspaceThread.workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected empty changeset run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const checkpoints = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        const checkpoint = checkpoints.checkpoints[0];
        if (!checkpoint) {
            throw new Error('Expected checkpoint for empty changeset run.');
        }

        const preview = await caller.checkpoint.previewRollback({
            profileId,
            checkpointId: checkpoint.id,
        });
        expect(preview.found).toBe(true);
        if (!preview.found) {
            throw new Error('Expected rollback preview for empty changeset run.');
        }
        expect(preview.preview.hasChangeset).toBe(true);
        expect(preview.preview.changeset?.changeCount).toBe(0);
        expect(preview.preview.canRevertSafely).toBe(false);
        expect(preview.preview.revertBlockedReason).toBe('changeset_empty');

        const reverted = await caller.checkpoint.revertChangeset({
            profileId,
            checkpointId: checkpoint.id,
            confirm: true,
        });
        expect(reverted.reverted).toBe(false);
        expect(reverted.reason).toBe('changeset_empty');

        rmSync(workspacePath, { recursive: true, force: true });
    });

    it('surfaces shared-target rollback risk and recommends changeset revert when two chats point at the same workspace path', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-checkpoint-shared-target-'));
        let fetchCallCount = 0;

        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(() => {
                fetchCallCount += 1;
                if (fetchCallCount === 1) {
                    writeFileSync(path.join(workspacePath, 'first.txt'), 'first change\n');
                } else {
                    writeFileSync(path.join(workspacePath, 'second.txt'), 'second change\n');
                }

                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'mutation complete',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 20,
                            total_tokens: 30,
                        },
                    }),
                };
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-shared-target-key',
        });
        expect(configured.success).toBe(true);

        const firstThread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Shared Target A',
            executionEnvironmentMode: 'local',
        });
        const secondThread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Shared Target B',
            executionEnvironmentMode: 'local',
        });
        const listedThreads = await caller.conversation.listThreads({
            profileId,
            activeTab: 'agent',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            sort: 'latest',
        });
        const firstWorkspaceThread = listedThreads.threads.find((item) => item.id === firstThread.thread.id);
        const secondWorkspaceThread = listedThreads.threads.find((item) => item.id === secondThread.thread.id);
        if (!firstWorkspaceThread?.workspaceFingerprint || !secondWorkspaceThread?.workspaceFingerprint) {
            throw new Error('Expected shared workspace fingerprints for both threads.');
        }

        const firstSession = await caller.session.create({
            profileId,
            threadId: requireEntityId(firstThread.thread.id, 'thr', 'Expected first shared-target thread id.'),
            kind: 'local',
        });
        const secondSession = await caller.session.create({
            profileId,
            threadId: requireEntityId(secondThread.thread.id, 'thr', 'Expected second shared-target thread id.'),
            kind: 'local',
        });
        if (!firstSession.created || !secondSession.created) {
            throw new Error('Expected both shared-target sessions to be created.');
        }

        const firstRun = await caller.session.startRun({
            profileId,
            sessionId: firstSession.session.id,
            prompt: 'First shared checkpoint',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: firstWorkspaceThread.workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(firstRun.accepted).toBe(true);
        if (!firstRun.accepted) {
            throw new Error('Expected first shared-target run to start.');
        }
        await waitForRunStatus(caller, profileId, firstSession.session.id, 'completed');

        const secondRun = await caller.session.startRun({
            profileId,
            sessionId: secondSession.session.id,
            prompt: 'Second shared checkpoint',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: secondWorkspaceThread.workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(secondRun.accepted).toBe(true);
        if (!secondRun.accepted) {
            throw new Error('Expected second shared-target run to start.');
        }
        await waitForRunStatus(caller, profileId, secondSession.session.id, 'completed');

        const firstCheckpoints = await caller.checkpoint.list({
            profileId,
            sessionId: firstSession.session.id,
        });
        const firstCheckpoint = firstCheckpoints.checkpoints[0];
        if (!firstCheckpoint) {
            throw new Error('Expected shared-target checkpoint for first session.');
        }

        const preview = await caller.checkpoint.previewRollback({
            profileId,
            checkpointId: firstCheckpoint.id,
        });
        expect(preview.found).toBe(true);
        if (!preview.found) {
            throw new Error('Expected shared-target rollback preview.');
        }
        expect(preview.preview.isSharedTarget).toBe(true);
        expect(preview.preview.hasLaterForeignChanges).toBe(true);
        expect(preview.preview.isHighRisk).toBe(true);
        expect(preview.preview.hasChangeset).toBe(true);
        expect(preview.preview.canRevertSafely).toBe(true);
        expect(preview.preview.recommendedAction).toBe('revert_changeset');
        expect(preview.preview.affectedSessions).toHaveLength(2);
        expect(preview.preview.affectedSessions.map((session) => session.threadTitle).sort()).toEqual([
            'Shared Target A',
            'Shared Target B',
        ]);

        rmSync(workspacePath, { recursive: true, force: true });
    }, 15_000);

    it('fails changeset revert closed when the current target has drifted from the recorded post-run state', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-checkpoint-drifted-revert-'));
        let resolveFetch: (() => void) | undefined;

        vi.stubGlobal(
            'fetch',
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        resolveFetch = () => {
                            resolve({
                                ok: true,
                                status: 200,
                                statusText: 'OK',
                                json: () => ({
                                    choices: [
                                        {
                                            message: {
                                                content: 'mutation complete',
                                            },
                                        },
                                    ],
                                    usage: {
                                        prompt_tokens: 10,
                                        completion_tokens: 20,
                                        total_tokens: 30,
                                    },
                                }),
                            });
                        };
                    })
            )
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-drifted-revert-key',
        });
        expect(configured.success).toBe(true);

        const thread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Drifted Revert Thread',
            executionEnvironmentMode: 'local',
        });
        const threadId = requireEntityId(thread.thread.id, 'thr', 'Expected drifted revert thread id.');
        const listedThreads = await caller.conversation.listThreads({
            profileId,
            activeTab: 'agent',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            sort: 'latest',
        });
        const workspaceThread = listedThreads.threads.find((item) => item.id === threadId);
        if (!workspaceThread?.workspaceFingerprint) {
            throw new Error('Expected workspace fingerprint for drifted revert thread.');
        }

        const created = await caller.session.create({
            profileId,
            threadId,
            kind: 'local',
        });
        if (!created.created) {
            throw new Error(`Expected session creation success, received "${created.reason}".`);
        }

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Change notes',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: workspaceThread.workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected drifted revert run to start.');
        }

        await vi.waitFor(() => {
            expect(resolveFetch).toBeTypeOf('function');
        });
        writeFileSync(path.join(workspacePath, 'notes.txt'), 'new content\n');
        resolveFetch?.();
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const checkpoints = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        const checkpoint = checkpoints.checkpoints[0];
        if (!checkpoint) {
            throw new Error('Expected checkpoint for drifted revert run.');
        }

        writeFileSync(path.join(workspacePath, 'notes.txt'), 'drifted\n');

        const preview = await caller.checkpoint.previewRollback({
            profileId,
            checkpointId: checkpoint.id,
        });
        expect(preview.found).toBe(true);
        if (!preview.found) {
            throw new Error('Expected rollback preview for drifted revert run.');
        }
        expect(preview.preview.hasChangeset).toBe(true);
        expect(preview.preview.canRevertSafely).toBe(false);
        expect(preview.preview.revertBlockedReason).toBe('target_drifted');

        const reverted = await caller.checkpoint.revertChangeset({
            profileId,
            checkpointId: checkpoint.id,
            confirm: true,
        });
        expect(reverted.reverted).toBe(false);
        expect(reverted.reason).toBe('target_drifted');
        expect(readFileSync(path.join(workspacePath, 'notes.txt'), 'utf8')).toBe('drifted\n');

        rmSync(workspacePath, { recursive: true, force: true });
    });

    it('creates, renames, and deletes milestone checkpoints without breaking rollback preview', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-checkpoint-milestone-'));
        let resolveFetch: (() => void) | undefined;

        vi.stubGlobal(
            'fetch',
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        resolveFetch = () => {
                            resolve({
                                ok: true,
                                status: 200,
                                statusText: 'OK',
                                json: () => ({
                                    choices: [
                                        {
                                            message: {
                                                content: 'milestone mutation complete',
                                            },
                                        },
                                    ],
                                    usage: {
                                        prompt_tokens: 10,
                                        completion_tokens: 20,
                                        total_tokens: 30,
                                    },
                                }),
                            });
                        };
                    })
            )
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-milestone-key',
        });
        expect(configured.success).toBe(true);

        const thread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Milestone Thread',
            executionEnvironmentMode: 'local',
        });
        const threadId = requireEntityId(thread.thread.id, 'thr', 'Expected milestone thread id.');
        const listedThreads = await caller.conversation.listThreads({
            profileId,
            activeTab: 'agent',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            sort: 'latest',
        });
        const workspaceThread = listedThreads.threads.find((item) => item.id === threadId);
        if (!workspaceThread?.workspaceFingerprint) {
            throw new Error('Expected workspace fingerprint for milestone thread.');
        }

        const created = await caller.session.create({
            profileId,
            threadId,
            kind: 'local',
        });
        if (!created.created) {
            throw new Error(`Expected session creation success, received "${created.reason}".`);
        }

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Create milestone source checkpoint',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: workspaceThread.workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected milestone run to start.');
        }

        await vi.waitFor(() => {
            expect(resolveFetch).toBeTypeOf('function');
        });
        writeFileSync(path.join(workspacePath, 'milestone.txt'), 'milestone change\n');
        resolveFetch?.();
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const firstList = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        const autoCheckpoint = firstList.checkpoints[0];
        if (!autoCheckpoint) {
            throw new Error('Expected checkpoint before milestone promotion.');
        }
        expect(autoCheckpoint.checkpointKind).toBe('auto');

        const createdMilestone = await caller.checkpoint.create({
            profileId,
            runId: started.runId,
            milestoneTitle: 'Release cut',
        });
        expect(createdMilestone.created).toBe(true);
        expect(createdMilestone.checkpoint?.id).toBe(autoCheckpoint.id);
        expect(createdMilestone.checkpoint?.checkpointKind).toBe('named');
        expect(createdMilestone.checkpoint?.milestoneTitle).toBe('Release cut');

        const preview = await caller.checkpoint.previewRollback({
            profileId,
            checkpointId: autoCheckpoint.id,
        });
        expect(preview.found).toBe(true);
        if (!preview.found) {
            throw new Error('Expected rollback preview after milestone promotion.');
        }
        expect(preview.preview.hasChangeset).toBe(true);

        const renamed = await caller.checkpoint.renameMilestone({
            profileId,
            checkpointId: autoCheckpoint.id,
            milestoneTitle: 'Release milestone',
        });
        expect(renamed.renamed).toBe(true);
        expect(renamed.checkpoint?.milestoneTitle).toBe('Release milestone');

        const listedMilestones = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        expect(listedMilestones.checkpoints[0]?.checkpointKind).toBe('named');
        expect(listedMilestones.checkpoints[0]?.milestoneTitle).toBe('Release milestone');
        expect(listedMilestones.checkpoints[0]?.retentionDisposition).toBe('milestone');

        const deleted = await caller.checkpoint.deleteMilestone({
            profileId,
            checkpointId: autoCheckpoint.id,
            confirm: true,
        });
        expect(deleted.deleted).toBe(true);

        const listedAfterDelete = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        expect(listedAfterDelete.checkpoints).toHaveLength(0);

        rmSync(workspacePath, { recursive: true, force: true });
    });

    it('previews and applies manual retention cleanup without touching current workspace files', async () => {
        const caller = createCaller();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-checkpoint-retention-'));
        const pathKey = process.platform === 'win32' ? workspacePath.toLowerCase() : workspacePath;
        const executionTargetKey = `workspace:${pathKey}`;
        const { sqlite } = getPersistence();

        writeFileSync(path.join(workspacePath, 'keep.txt'), 'keep me\n');

        const thread = await caller.conversation.createThread({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspacePath,
            title: 'Retention Thread',
            executionEnvironmentMode: 'local',
        });
        const threadId = requireEntityId(thread.thread.id, 'thr', 'Expected retention thread id.');
        const listedThreads = await caller.conversation.listThreads({
            profileId,
            activeTab: 'agent',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            sort: 'latest',
        });
        const workspaceThread = listedThreads.threads.find((item) => item.id === threadId);
        if (!workspaceThread?.workspaceFingerprint) {
            throw new Error('Expected workspace fingerprint for retention thread.');
        }

        const created = await caller.session.create({
            profileId,
            threadId,
            kind: 'local',
        });
        if (!created.created) {
            throw new Error(`Expected session creation success, received "${created.reason}".`);
        }

        const seededCheckpoints: EntityId<'ckpt'>[] = [];
        for (let index = 0; index < 24; index += 1) {
            const checkpoint = await checkpointStore.create({
                profileId,
                sessionId: created.session.id,
                threadId,
                workspaceFingerprint: workspaceThread.workspaceFingerprint,
                executionTargetKey,
                executionTargetKind: 'workspace',
                executionTargetLabel: 'Retention Workspace',
                createdByKind: index === 23 ? 'user' : 'system',
                checkpointKind: index === 23 ? 'named' : 'auto',
                ...(index === 23 ? { milestoneTitle: 'Pinned milestone' } : {}),
                snapshotFileCount: 1,
                topLevelTab: 'agent',
                modeKey: 'code',
                summary: index === 23 ? 'Pinned milestone' : `Checkpoint ${String(index)}`,
            });
            seededCheckpoints.push(checkpoint.id);

            await checkpointSnapshotStore.replaceSnapshot({
                checkpointId: checkpoint.id,
                files: [
                    {
                        relativePath: `snap-${String(index)}.txt`,
                        bytes: Buffer.from(`snapshot-${String(index)}`),
                    },
                ],
            });

            if (index < 3) {
                await checkpointChangesetStore.replaceForCheckpoint({
                    profileId,
                    checkpointId: checkpoint.id,
                    sessionId: created.session.id,
                    threadId,
                    executionTargetKey,
                    executionTargetKind: 'workspace',
                    executionTargetLabel: 'Retention Workspace',
                    createdByKind: 'system',
                    changesetKind: 'run_capture',
                    summary: `Checkpoint ${String(index)} changed one file`,
                    entries: [
                        {
                            relativePath: `snap-${String(index)}.txt`,
                            changeKind: 'modified',
                            beforeBytes: Buffer.from(`before-${String(index)}`),
                            afterBytes: Buffer.from(`after-${String(index)}`),
                        },
                    ],
                });
            }

            const createdAt = new Date(Date.UTC(2026, 2, 19, 12, 0, index)).toISOString();
            sqlite
                .prepare(`UPDATE checkpoints SET created_at = ?, updated_at = ? WHERE id = ?`)
                .run(createdAt, createdAt, checkpoint.id);
        }

        const preview = await caller.checkpoint.previewCleanup({
            profileId,
            sessionId: created.session.id,
        });
        expect(preview.milestoneCount).toBe(1);
        expect(preview.protectedRecentCount).toBe(20);
        expect(preview.eligibleCount).toBe(3);
        expect(preview.candidates).toHaveLength(3);
        expect(preview.candidates.map((candidate) => candidate.summary)).toEqual([
            'Checkpoint 2',
            'Checkpoint 1',
            'Checkpoint 0',
        ]);

        const apply = await caller.checkpoint.applyCleanup({
            profileId,
            sessionId: created.session.id,
            confirm: true,
        });
        expect(apply.cleanedUp).toBe(true);
        expect(apply.deletedCount).toBe(3);
        expect(apply.prunedBlobCount).toBeGreaterThan(0);
        expect(readFileSync(path.join(workspacePath, 'keep.txt'), 'utf8')).toBe('keep me\n');

        const afterCleanup = await caller.checkpoint.list({
            profileId,
            sessionId: created.session.id,
        });
        expect(afterCleanup.checkpoints).toHaveLength(21);
        expect(afterCleanup.checkpoints.some((checkpoint) => checkpoint.summary === 'Pinned milestone')).toBe(true);
        expect(afterCleanup.checkpoints.some((checkpoint) => checkpoint.summary === 'Checkpoint 0')).toBe(false);
        expect(afterCleanup.checkpoints.some((checkpoint) => checkpoint.summary === 'Checkpoint 1')).toBe(false);
        expect(afterCleanup.checkpoints.some((checkpoint) => checkpoint.summary === 'Checkpoint 2')).toBe(false);

        rmSync(workspacePath, { recursive: true, force: true });
    });
});
