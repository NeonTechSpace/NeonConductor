import { describe, expect, it } from 'vitest';

import {
    registerPersistenceStoreHooks,
    checkpointStore,
    conversationStore,
    diffStore,
    getDefaultProfileId,
    runStore,
    sessionHistoryService,
    sessionStore,
    tagStore,
    threadStore,
} from '@/app/backend/persistence/__tests__/stores.shared';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';

registerPersistenceStoreHooks();

describe('persistence stores: conversation domain', () => {
    it('supports session store lifecycle CRUD-style flows', async () => {
        const profileId = getDefaultProfileId();
        const bucket = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'detached',
            title: 'Detached',
        });
        if (bucket.isErr()) {
            throw new Error(bucket.error.message);
        }
        const thread = await threadStore.create({
            profileId,
            conversationId: bucket.value.id,
            title: 'Main',
            topLevelTab: 'chat',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }
        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }
        expect(session.session.turnCount).toBe(0);

        const run = await runStore.create({
            profileId,
            sessionId: session.session.id,
            prompt: 'hello',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            cache: {
                applied: false,
                key: 'store-test',
                reason: 'unsupported_transport',
            },
            transport: {
                selected: 'openai_responses',
            },
        });
        await sessionStore.markRunPending(profileId, session.session.id, run.id);
        await runStore.finalize(run.id, { status: 'completed' });
        await sessionStore.markRunTerminal(profileId, session.session.id, 'completed');

        const status = await sessionStore.status(profileId, session.session.id);
        expect(status.found).toBe(true);
        if (!status.found) {
            throw new Error('Expected session to exist.');
        }
        expect(status.session.runStatus).toBe('completed');

        const reverted = await sessionHistoryService.revert(profileId, session.session.id);
        expect(reverted.reverted).toBe(true);
    });


    it('returns typed errors for invalid tag writes and missing session refreshes', async () => {
        const profileId = getDefaultProfileId();

        const invalidTag = await tagStore.upsert(profileId, '   ');
        expect(invalidTag.isErr()).toBe(true);
        if (invalidTag.isOk()) {
            throw new Error('Expected empty tag label to fail.');
        }
        expect(invalidTag.error.code).toBe('invalid_input');

        const missingRefresh = await sessionStore.refreshStatus(profileId, 'sess_missing' as `sess_${string}`);
        expect(missingRefresh.isErr()).toBe(true);
        if (missingRefresh.isOk()) {
            throw new Error('Expected missing session refresh to fail.');
        }
        expect(missingRefresh.error.code).toBe('not_found');
    });


    it('supports conversations, threads, tags, diffs, and checkpoints', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_workspace_a',
            title: 'Workspace Chat',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }
        const thread = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Thread A',
            topLevelTab: 'chat',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }
        const tagResult = await tagStore.upsert(profileId, 'backend');
        expect(tagResult.isOk()).toBe(true);
        if (tagResult.isErr()) {
            throw new Error(tagResult.error.message);
        }
        const tag = tagResult.value;
        const linkedResult = await tagStore.setThreadTags(profileId, thread.value.id, [tag.id]);
        expect(linkedResult.isOk()).toBe(true);
        if (linkedResult.isErr()) {
            throw new Error(linkedResult.error.message);
        }
        const linked = linkedResult.value;

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }
        const run = await runStore.create({
            profileId,
            sessionId: session.session.id,
            prompt: 'first',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            cache: {
                applied: false,
                key: 'store-test',
                reason: 'unsupported_transport',
            },
            transport: {
                selected: 'openai_responses',
            },
        });
        await sessionStore.markRunPending(profileId, session.session.id, run.id);
        await runStore.finalize(run.id, { status: 'completed' });
        await sessionStore.markRunTerminal(profileId, session.session.id, 'completed');

        const diff = await diffStore.create({
            profileId,
            sessionId: session.session.id,
            runId: run.id,
            summary: 'created patch',
            artifact: {
                kind: 'git',
                workspaceRootPath: 'M:\\workspace',
                workspaceLabel: 'workspace',
                baseRef: 'HEAD',
                fileCount: 1,
                files: [{ path: 'README.md', status: 'modified' }],
                fullPatch: 'diff --git a/README.md b/README.md\n',
                patchesByPath: {
                    'README.md': 'diff --git a/README.md b/README.md\n',
                },
            },
        });
        const checkpoint = await checkpointStore.create({
            profileId,
            sessionId: session.session.id,
            runId: run.id,
            diffId: diff.id,
            workspaceFingerprint: 'wsf_workspace_a',
            topLevelTab: 'agent',
            modeKey: 'code',
            summary: 'created checkpoint',
        });

        const conversations = await conversationStore.listBuckets(profileId);
        const threads = await threadStore.list({
            profileId,
            activeTab: 'chat',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            workspaceFingerprint: 'wsf_workspace_a',
            sort: 'latest',
        });
        const tags = await tagStore.listByProfile(profileId);
        const threadTags = await tagStore.listThreadTagsByProfile(profileId);
        const diffs = await diffStore.listBySession(profileId, session.session.id);
        const checkpoints = await checkpointStore.listBySession(profileId, session.session.id);
        const firstLinked = linked[0];
        if (!firstLinked) {
            throw new Error('Expected at least one linked thread tag.');
        }

        expect(conversations.some((item) => item.id === conversation.value.id)).toBe(true);
        expect(threads.some((item) => item.id === thread.value.id)).toBe(true);
        expect(tags.some((item) => item.id === tag.id)).toBe(true);
        expect(
            threadTags.some((item) => item.threadId === firstLinked.threadId && item.tagId === firstLinked.tagId)
        ).toBe(true);
        expect(diffs.some((item) => item.id === diff.id)).toBe(true);
        expect(checkpoints.some((item) => item.id === checkpoint.id)).toBe(true);
    });

    it('supports favorites and workspace thread deletion with favorite protection', async () => {
        const profileId = getDefaultProfileId();
        const workspaceFingerprint = 'wsf_workspace_bulk_delete';
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Workspace Delete',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const removableThread = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Removable',
            topLevelTab: 'chat',
        });
        const favoriteThread = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Favorite',
            topLevelTab: 'chat',
        });
        if (removableThread.isErr()) {
            throw new Error(removableThread.error.message);
        }
        if (favoriteThread.isErr()) {
            throw new Error(favoriteThread.error.message);
        }

        const favoriteUpdate = await threadStore.setFavorite(
            profileId,
            parseEntityId(favoriteThread.value.id, 'threads.id', 'thr'),
            true
        );
        if (favoriteUpdate.isErr()) {
            throw new Error(favoriteUpdate.error.message);
        }

        const removableTag = await tagStore.upsert(profileId, 'remove-me');
        const favoriteTag = await tagStore.upsert(profileId, 'keep-me');
        if (removableTag.isErr()) {
            throw new Error(removableTag.error.message);
        }
        if (favoriteTag.isErr()) {
            throw new Error(favoriteTag.error.message);
        }

        const removableTagLink = await tagStore.setThreadTags(profileId, removableThread.value.id, [removableTag.value.id]);
        if (removableTagLink.isErr()) {
            throw new Error(removableTagLink.error.message);
        }
        const favoriteTagLink = await tagStore.setThreadTags(profileId, favoriteThread.value.id, [favoriteTag.value.id]);
        if (favoriteTagLink.isErr()) {
            throw new Error(favoriteTagLink.error.message);
        }

        const previewWithoutFavorites = await threadStore.getWorkspaceDeletePreview({
            profileId,
            workspaceFingerprint,
            includeFavorites: false,
        });
        expect(previewWithoutFavorites.totalThreadCount).toBe(2);
        expect(previewWithoutFavorites.favoriteThreadCount).toBe(1);
        expect(previewWithoutFavorites.deletableThreadCount).toBe(1);

        const deletedWithoutFavorites = await threadStore.deleteWorkspaceThreads({
            profileId,
            workspaceFingerprint,
            includeFavorites: false,
        });
        expect(deletedWithoutFavorites.deletedThreadIds).toEqual([removableThread.value.id]);

        const remainingThreads = await threadStore.list({
            profileId,
            activeTab: 'chat',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            workspaceFingerprint,
            sort: 'latest',
        });
        expect(remainingThreads.map((thread) => thread.id)).toEqual([favoriteThread.value.id]);
        expect(remainingThreads[0]?.isFavorite).toBe(true);

        const remainingTags = await tagStore.listByProfile(profileId);
        expect(remainingTags.some((tag) => tag.id === removableTag.value.id)).toBe(false);
        expect(remainingTags.some((tag) => tag.id === favoriteTag.value.id)).toBe(true);

        const previewWithFavorites = await threadStore.getWorkspaceDeletePreview({
            profileId,
            workspaceFingerprint,
            includeFavorites: true,
        });
        expect(previewWithFavorites.deletableThreadCount).toBe(1);

        const deletedWithFavorites = await threadStore.deleteWorkspaceThreads({
            profileId,
            workspaceFingerprint,
            includeFavorites: true,
        });
        expect(deletedWithFavorites.deletedThreadIds).toEqual([favoriteThread.value.id]);

        const finalThreads = await threadStore.list({
            profileId,
            activeTab: 'chat',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            workspaceFingerprint,
            sort: 'latest',
        });
        expect(finalThreads).toEqual([]);
    });
});
