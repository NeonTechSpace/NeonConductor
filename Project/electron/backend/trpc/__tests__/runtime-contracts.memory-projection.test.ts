import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { getPersistence } from '@/app/backend/persistence/db';
import { memoryRevisionStore, sandboxStore } from '@/app/backend/persistence/stores';
import { errOp } from '@/app/backend/runtime/services/common/operationalError';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import {
    createCaller,
    createSessionInScope,
    registerRuntimeContractHooks,
    requireEntityId,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: memory projection files', () => {
    const profileId = runtimeContractProfileId;
    it('syncs memory projection files to workspace and global roots', async () => {
        const caller = createCaller();
        const globalMemoryRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-global-'));
        vi.stubEnv('NEONCONDUCTOR_GLOBAL_MEMORY_ROOT', globalMemoryRoot);
        const workspaceFingerprint = 'wsf_runtime_memory_projection';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory projection thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected projection thread id.');

        const globalMemory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'global',
            createdByKind: 'user',
            title: 'Projection global memory',
            bodyMarkdown: 'Global projection body.',
        });
        const threadMemory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Projection thread memory',
            bodyMarkdown: 'Thread projection body.',
            metadata: {
                source: 'manual',
            },
        });

        const synced = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            threadId,
        });

        expect(synced.paths.globalMemoryRoot).toBe(globalMemoryRoot);
        expect(synced.paths.workspaceMemoryRoot).toMatch(/\.neonconductor[\\/]memory$/);
        const projectedById = new Map(synced.projectedMemories.map((record) => [record.memory.id, record] as const));
        const globalProjected = projectedById.get(globalMemory.memory.id);
        const threadProjected = projectedById.get(threadMemory.memory.id);
        expect(globalProjected?.syncState).toBe('in_sync');
        expect(threadProjected?.syncState).toBe('in_sync');

        const projectedThreadFile = threadProjected?.absolutePath;
        if (!projectedThreadFile) {
            throw new Error('Expected projected thread memory file.');
        }

        const projectedThreadContent = readFileSync(projectedThreadFile, 'utf8');
        expect(projectedThreadContent).toContain('memoryType: "procedural"');
        expect(projectedThreadContent).toContain('threadId:');
        expect(projectedThreadContent).toContain('metadata: {"source":"manual"}');
    });

    it('keeps workspace memory projection pinned to the base workspace root when a sandbox is selected', async () => {
        const caller = createCaller();
        const globalMemoryRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-sandbox-global-'));
        vi.stubEnv('NEONCONDUCTOR_GLOBAL_MEMORY_ROOT', globalMemoryRoot);
        const workspaceFingerprint = 'wsf_runtime_memory_sandbox_projection';
        await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory sandbox projection thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const workspaceRootRow = getPersistence()
            .sqlite.prepare('SELECT absolute_path FROM workspace_roots WHERE profile_id = ? AND fingerprint = ?')
            .get(profileId, workspaceFingerprint) as { absolute_path: string } | undefined;
        if (!workspaceRootRow) {
            throw new Error('Expected workspace root for memory sandbox projection test.');
        }

        const sandboxPath = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-sandbox-'));
        const sandbox = await sandboxStore.create({
            profileId,
            workspaceFingerprint,
            absolutePath: sandboxPath,
            label: 'memory-sandbox',
            status: 'ready',
            creationStrategy: 'copy',
        });

        const workspaceMemory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'workspace',
            createdByKind: 'user',
            workspaceFingerprint,
            title: 'Workspace projected memory',
            bodyMarkdown: 'Workspace projection body.',
        });

        const synced = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            sandboxId: sandbox.id,
        });

        expect(synced.paths.workspaceMemoryRoot).toBe(
            path.join(workspaceRootRow.absolute_path, '.neonconductor', 'memory')
        );
        const projected = synced.projectedMemories.find((record) => record.memory.id === workspaceMemory.memory.id);
        expect(projected?.projectionTarget).toBe('workspace');
        expect(projected?.absolutePath).toBe(
            path.join(
                workspaceRootRow.absolute_path,
                '.neonconductor',
                'memory',
                'semantic',
                `workspace--${workspaceMemory.memory.id}.md`
            )
        );
    });

    it('scans, applies, and rejects projected memory edits through reviewed proposals', async () => {
        const caller = createCaller();
        const globalMemoryRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-review-'));
        vi.stubEnv('NEONCONDUCTOR_GLOBAL_MEMORY_ROOT', globalMemoryRoot);
        const workspaceFingerprint = 'wsf_runtime_memory_review';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory review thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected review thread id.');

        const editableMemory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Editable memory',
            bodyMarkdown: 'Original body.',
            metadata: {
                source: 'manual',
            },
        });

        const synced = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        const projectedMemory = synced.projectedMemories.find(
            (record) => record.memory.id === editableMemory.memory.id
        );
        if (!projectedMemory) {
            throw new Error('Expected synced projected memory.');
        }

        writeFileSync(
            projectedMemory.absolutePath,
            `---\nid: "${editableMemory.memory.id}"\nmemoryType: "procedural"\nscopeKind: "thread"\nstate: "active"\ntitle: "Editable memory v2"\nmemoryRetentionClass: "task"\nthreadId: "${threadId}"\nworkspaceFingerprint: "${workspaceFingerprint}"\nmetadata: {"source":"projection","revision":2}\n---\nUpdated projection body.\n`,
            'utf8'
        );

        const scanned = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        expect(scanned.proposals).toHaveLength(1);
        expect(scanned.proposals[0]?.reviewAction).toBe('update');

        const proposal = scanned.proposals[0];
        if (!proposal) {
            throw new Error('Expected memory edit proposal.');
        }

        const applied = await caller.memory.applyProjectionEdit({
            profileId,
            workspaceFingerprint,
            threadId,
            memoryId: proposal.memory.id,
            observedContentHash: proposal.observedContentHash,
            decision: 'accept',
        });
        expect(applied.appliedAction).toBe('update');
        expect(applied.memory.title).toBe('Editable memory v2');
        expect(applied.memory.metadata).toEqual({ source: 'projection', revision: 2 });

        writeFileSync(
            projectedMemory.absolutePath,
            `---\nid: "${applied.memory.id}"\nmemoryType: "procedural"\nscopeKind: "thread"\nstate: "active"\ntitle: "Editable memory rejected"\nmemoryRetentionClass: "task"\nthreadId: "${threadId}"\nworkspaceFingerprint: "${workspaceFingerprint}"\nmetadata: {"source":"projection","revision":3}\n---\nRejected projection body.\n`,
            'utf8'
        );

        const rejectScan = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        expect(rejectScan.proposals).toHaveLength(1);
        const rejectProposal = rejectScan.proposals[0];
        if (!rejectProposal) {
            throw new Error('Expected rejectable memory edit proposal.');
        }

        const rejected = await caller.memory.applyProjectionEdit({
            profileId,
            workspaceFingerprint,
            threadId,
            memoryId: rejectProposal.memory.id,
            observedContentHash: rejectProposal.observedContentHash,
            decision: 'reject',
        });
        expect(rejected.decision).toBe('reject');
        expect(rejected.memory.title).toBe('Editable memory v2');

        writeFileSync(projectedMemory.absolutePath, 'not valid frontmatter', 'utf8');

        const parseErrorScan = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        expect(parseErrorScan.proposals).toHaveLength(0);
        expect(parseErrorScan.parseErrors).toHaveLength(1);
    });

    it('applies projected supersede edits using correction revision metadata', async () => {
        const caller = createCaller();
        const globalMemoryRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-review-supersede-'));
        vi.stubEnv('NEONCONDUCTOR_GLOBAL_MEMORY_ROOT', globalMemoryRoot);
        const workspaceFingerprint = 'wsf_runtime_memory_review_supersede';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory review supersede thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected review supersede thread id.');

        const editableMemory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Supersede projection memory',
            bodyMarkdown: 'Original projection body.',
            temporalSubjectKey: 'subject::projection-memory',
        });

        const synced = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        const projectedMemory = synced.projectedMemories.find(
            (record) => record.memory.id === editableMemory.memory.id
        );
        if (!projectedMemory) {
            throw new Error('Expected synced projected memory for supersede review.');
        }

        writeFileSync(
            projectedMemory.absolutePath,
            `---\nid: "${editableMemory.memory.id}"\nmemoryType: "procedural"\nscopeKind: "thread"\nstate: "superseded"\ntitle: "Supersede projection memory v2"\nmemoryRetentionClass: "task"\nthreadId: "${threadId}"\nworkspaceFingerprint: "${workspaceFingerprint}"\nmetadata: {"source":"projection","revision":2}\n---\nSuperseded projection body.\n`,
            'utf8'
        );

        const scanned = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        expect(scanned.proposals[0]?.reviewAction).toBe('supersede');
        const proposal = scanned.proposals[0];
        if (!proposal) {
            throw new Error('Expected supersede memory edit proposal.');
        }

        const applied = await caller.memory.applyProjectionEdit({
            profileId,
            workspaceFingerprint,
            threadId,
            memoryId: proposal.memory.id,
            observedContentHash: proposal.observedContentHash,
            decision: 'accept',
        });
        expect(applied.appliedAction).toBe('supersede');
        expect(applied.previousMemory?.id).toBe(editableMemory.memory.id);

        const revision = await memoryRevisionStore.getByPreviousMemoryId(profileId, editableMemory.memory.id);
        expect(revision?.revisionReason).toBe('correction');
        expect(revision?.replacementMemoryId).toBe(applied.memory.id);
    });

    it('does not overwrite edited projected memory files during sync', async () => {
        const caller = createCaller();
        const globalMemoryRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-memory-sync-preserve-'));
        vi.stubEnv('NEONCONDUCTOR_GLOBAL_MEMORY_ROOT', globalMemoryRoot);
        const workspaceFingerprint = 'wsf_runtime_memory_sync_preserve';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory sync preserve thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected preserve thread id.');

        const editableMemory = await caller.memory.create({
            profileId,
            memoryType: 'procedural',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Sync preserve memory',
            bodyMarkdown: 'Original projection body.',
        });

        const firstSync = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        const projectedMemory = firstSync.projectedMemories.find(
            (record) => record.memory.id === editableMemory.memory.id
        );
        if (!projectedMemory) {
            throw new Error('Expected projected memory for sync preservation test.');
        }

        const editedContent =
            `---\n` +
            `id: "${editableMemory.memory.id}"\n` +
            `memoryType: "procedural"\n` +
            `scopeKind: "thread"\n` +
            `state: "active"\n` +
            `title: "Sync preserve edited"\n` +
            `memoryRetentionClass: "task"\n` +
            `threadId: "${threadId}"\n` +
            `workspaceFingerprint: "${workspaceFingerprint}"\n` +
            `metadata: {"edited":true}\n` +
            `---\n` +
            `Preserve this edited body.\n`;
        writeFileSync(projectedMemory.absolutePath, editedContent, 'utf8');

        const editedScan = await caller.memory.scanProjectionEdits({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        expect(editedScan.proposals).toHaveLength(1);
        expect(editedScan.proposals[0]?.proposedTitle).toBe('Sync preserve edited');

        const secondSync = await caller.memory.syncProjection({
            profileId,
            workspaceFingerprint,
            threadId,
        });
        const resynced = secondSync.projectedMemories.find((record) => record.memory.id === editableMemory.memory.id);
        expect(resynced?.syncState).toBe('edited');
        expect(readFileSync(projectedMemory.absolutePath, 'utf8')).toBe(editedContent);
    });

    it('keeps projection sync working when derived summaries fail', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_runtime_memory_projection_fail_soft';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Memory projection fail-soft thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const threadId = requireEntityId(created.thread.id, 'thr', 'Expected projection fail-soft thread id.');

        const memory = await caller.memory.create({
            profileId,
            memoryType: 'semantic',
            scopeKind: 'thread',
            createdByKind: 'user',
            threadId,
            title: 'Projection fail-soft memory',
            bodyMarkdown: 'Projection should still sync when the derived layer fails.',
        });

        const summarySpy = vi.spyOn(advancedMemoryDerivationService, 'getDerivedSummaries').mockImplementation(() => {
            const result = errOp('request_failed', 'Derived summaries failed.');
            result.match(
                () => undefined,
                () => undefined
            );
            return Promise.resolve(result);
        });

        try {
            const synced = await caller.memory.syncProjection({
                profileId,
                workspaceFingerprint,
                threadId,
            });
            const projected = synced.projectedMemories.find((record) => record.memory.id === memory.memory.id);
            expect(projected?.syncState).toBe('in_sync');
            expect(projected?.derivedSummary).toBeUndefined();
            expect(readFileSync(projected?.absolutePath ?? '', 'utf8')).toContain('Projection fail-soft memory');
        } finally {
            summarySpy.mockRestore();
        }
    });
});
