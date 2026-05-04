import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { workspaceRootStore } from '@/app/backend/persistence/stores';
import type { ResearchCheckoutCommandRunner } from '@/app/backend/runtime/services/researchCheckouts/commandRunner';
import { ResearchCheckoutService } from '@/app/backend/runtime/services/researchCheckouts/service';

const profileId = getDefaultProfileId();

function runnerWithStdout(stdout: string): ResearchCheckoutCommandRunner {
    return {
        run: () =>
            Promise.resolve({
                exitCode: 0,
                stdout,
                stderr: '',
                timedOut: false,
            }),
    };
}

async function setCustomRoot(service: ResearchCheckoutService, root: string): Promise<void> {
    const result = await service.setRootSettings({
        profileId,
        policy: 'custom_path',
        customAbsolutePath: root,
    });
    expect(result.isOk()).toBe(true);
}

describe('research checkout service', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('defaults to an OS temp checkout root and validates custom roots', async () => {
        const service = new ResearchCheckoutService(runnerWithStdout(''));

        await expect(service.getRootSettings(profileId)).resolves.toMatchObject({
            profileId,
            policy: 'os_temp',
        });

        const invalid = await service.setRootSettings({
            profileId,
            policy: 'custom_path',
            customAbsolutePath: 'relative/research',
        });
        expect(invalid.isErr()).toBe(true);

        const customRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-research-root-'));
        const saved = await service.setRootSettings({
            profileId,
            policy: 'custom_path',
            customAbsolutePath: customRoot,
        });
        expect(saved.isOk()).toBe(true);
        expect(saved._unsafeUnwrap().settings.customAbsolutePath).toBe(path.resolve(customRoot));
    });

    it('rejects credential-bearing repo URLs and does not register workspace roots', async () => {
        const service = new ResearchCheckoutService(runnerWithStdout(''));
        const initialRoots = await workspaceRootStore.listByProfile(profileId);

        const result = await service.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://user:secret@example.com/acme/private.git',
            },
        });

        expect(result.isErr()).toBe(true);
        expect(await workspaceRootStore.listByProfile(profileId)).toEqual(initialRoots);
    });

    it('plans a deterministic missing checkout without cloning it', async () => {
        const service = new ResearchCheckoutService(runnerWithStdout(''));
        const customRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-research-root-'));
        await setCustomRoot(service, customRoot);

        const result = await service.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/conductor.git',
            },
        });

        expect(result.isOk()).toBe(true);
        const researchTarget = result._unsafeUnwrap().researchTarget;
        expect(researchTarget.checkoutAction).toBe('clone_required');
        expect(researchTarget.updateAction).toBe('unavailable');
        expect(researchTarget.resolvedCheckoutPath).toMatch(customRoot);
        expect(researchTarget.locator.canonicalKey).toBe('https://github.com/neon/conductor');
        expect(researchTarget.checkoutRecordId).toMatch(/^rch_/u);
    });

    it('plans git clean behind checkouts as fast-forward-only reuse', async () => {
        const service = new ResearchCheckoutService(runnerWithStdout('## main...origin/main [behind 1]\n'));
        const customRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-research-root-'));
        await setCustomRoot(service, customRoot);
        const missing = await service.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/conductor.git',
                requestedTarget: { kind: 'branch', name: 'main' },
            },
        });
        const checkoutPath = missing._unsafeUnwrap().researchTarget.resolvedCheckoutPath;
        mkdirSync(path.join(checkoutPath, '.git'), { recursive: true });

        const result = await service.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/conductor.git',
                requestedTarget: { kind: 'branch', name: 'main' },
            },
        });

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap().researchTarget).toMatchObject({
            checkoutAction: 'reuse_existing',
            updateAction: 'fast_forward',
            targetSwitchAction: 'checkout_branch',
            detectedVcs: 'git',
            effectiveVcs: 'git',
            repoWorkflowState: {
                status: 'clean',
                branch: 'main',
                syncStatus: 'behind',
            },
        });
    });

    it('pauses dirty git checkouts and uses fetch-only planning for clean jj checkouts', async () => {
        const customRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-research-root-'));
        const gitService = new ResearchCheckoutService(runnerWithStdout('## main...origin/main\n M src/index.ts\n'));
        await setCustomRoot(gitService, customRoot);
        const gitMissing = await gitService.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/dirty.git',
                requestedTarget: { kind: 'commit', sha: 'abcdef1' },
            },
        });
        mkdirSync(path.join(gitMissing._unsafeUnwrap().researchTarget.resolvedCheckoutPath, '.git'), {
            recursive: true,
        });

        const dirtyGit = await gitService.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/dirty.git',
                requestedTarget: { kind: 'commit', sha: 'abcdef1' },
            },
        });
        expect(dirtyGit._unsafeUnwrap().researchTarget.updateAction).toBe('pause_for_review');
        expect(dirtyGit._unsafeUnwrap().researchTarget.targetSwitchAction).toBe('pause_for_review');

        const jjService = new ResearchCheckoutService(runnerWithStdout('The working copy has no changes.\n'));
        await setCustomRoot(jjService, customRoot);
        const jjMissing = await jjService.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/jj.git',
            },
        });
        mkdirSync(path.join(jjMissing._unsafeUnwrap().researchTarget.resolvedCheckoutPath, '.jj'), {
            recursive: true,
        });

        const cleanJj = await jjService.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/jj.git',
            },
        });
        expect(cleanJj._unsafeUnwrap().researchTarget.updateAction).toBe('fetch_only');
        expect(cleanJj._unsafeUnwrap().researchTarget.effectiveVcs).toBe('jj');
    });

    it('resolves current-workspace roots only when a workspace is available', async () => {
        const service = new ResearchCheckoutService(runnerWithStdout(''));
        const saved = await service.setRootSettings({
            profileId,
            policy: 'current_workspace',
        });
        expect(saved.isOk()).toBe(true);

        const detached = await service.previewResearchTarget({
            profileId,
            target: { repoUrl: 'https://github.com/neon/conductor.git' },
        });
        expect(detached.isErr()).toBe(true);

        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'nc-workspace-'));
        const workspace = await workspaceRootStore.resolveOrCreate(profileId, workspacePath, 'Workspace');
        const resolved = await service.previewResearchTarget({
            profileId,
            workspaceFingerprint: workspace.fingerprint,
            target: { repoUrl: 'https://github.com/neon/conductor.git' },
        });

        expect(resolved.isOk()).toBe(true);
        expect(resolved._unsafeUnwrap().researchTarget.rootAbsolutePath).toBe(
            path.join(workspacePath, '.neonconductor', 'research-repos')
        );
    });

    it('requires approval for dirty commit intents and keeps push blocked', async () => {
        const customRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-research-root-'));
        const commitService = new ResearchCheckoutService(runnerWithStdout('## main...origin/main\n M src/index.ts\n'));
        await setCustomRoot(commitService, customRoot);
        const missing = await commitService.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/commit.git',
                mutationIntent: 'commit',
            },
        });
        expect(missing.isOk()).toBe(true);
        mkdirSync(path.join(missing._unsafeUnwrap().researchTarget.resolvedCheckoutPath, '.git'), {
            recursive: true,
        });

        const commit = await commitService.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/commit.git',
                mutationIntent: 'commit',
            },
        });

        expect(commit.isOk()).toBe(true);
        expect(commit._unsafeUnwrap().researchTarget.mutationGuardrail).toMatchObject({
            intent: 'commit',
            outcome: 'approval_required',
        });

        const service = new ResearchCheckoutService(runnerWithStdout(''));
        const result = await service.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/conductor.git',
                mutationIntent: 'push',
            },
        });

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap().researchTarget.mutationGuardrail).toMatchObject({
            intent: 'push',
            outcome: 'blocked',
        });
    });
});
