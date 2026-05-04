import { mkdirSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import type {
    ResearchCheckoutCommandResult,
    ResearchCheckoutCommandRunner,
} from '@/app/backend/runtime/services/researchCheckouts/commandRunner';
import { RepoCommitService } from '@/app/backend/runtime/services/researchCheckouts/commitService';
import { ResearchCheckoutService } from '@/app/backend/runtime/services/researchCheckouts/service';

const profileId = getDefaultProfileId();

function okCommand(stdout: string): ResearchCheckoutCommandResult {
    return {
        exitCode: 0,
        stdout,
        stderr: '',
        timedOut: false,
    };
}

function runnerWithStdout(stdout: string): ResearchCheckoutCommandRunner {
    return {
        run: () => Promise.resolve(okCommand(stdout)),
    };
}

function requireCheckoutRecordId(input: { checkoutRecordId?: `rch_${string}` }): `rch_${string}` {
    if (!input.checkoutRecordId) {
        throw new Error('Expected materialized research target to include a checkout record id.');
    }
    return input.checkoutRecordId;
}

function requireWorkingTreeDigest(input: { expectedWorkingTreeDigest?: string }): string {
    if (!input.expectedWorkingTreeDigest) {
        throw new Error('Expected commit preview to include a working tree digest.');
    }
    return input.expectedWorkingTreeDigest;
}

function scriptedRunner(entries: Array<{ command: string; args: string[]; result: ResearchCheckoutCommandResult }>): {
    runner: ResearchCheckoutCommandRunner;
    calls: Array<{ command: string; args: string[]; cwd: string }>;
} {
    const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
    return {
        calls,
        runner: {
            run: (input) => {
                calls.push({ command: input.command, args: input.args, cwd: input.cwd });
                const entry = entries.shift();
                if (!entry) {
                    throw new Error(`Unexpected command: ${input.command} ${input.args.join(' ')}`);
                }
                expect(input.command).toBe(entry.command);
                expect(input.args).toEqual(entry.args);
                return Promise.resolve(entry.result);
            },
        },
    };
}

async function createMaterializedCheckout(input: {
    vcs: 'git' | 'jj';
    statusOutput: string;
    repoUrl?: string;
}) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'nc-repo-commit-root-'));
    const checkoutService = new ResearchCheckoutService(runnerWithStdout(input.statusOutput));
    const settings = await checkoutService.setRootSettings({
        profileId,
        policy: 'custom_path',
        customAbsolutePath: root,
    });
    expect(settings.isOk()).toBe(true);
    const missing = await checkoutService.previewResearchTarget({
        profileId,
        target: { repoUrl: input.repoUrl ?? `https://github.com/neon/${input.vcs}-commit.git` },
    });
    expect(missing.isOk()).toBe(true);
    const checkoutPath = missing._unsafeUnwrap().researchTarget.resolvedCheckoutPath;
    mkdirSync(path.join(checkoutPath, input.vcs === 'git' ? '.git' : '.jj'), { recursive: true });

    const materialized = await checkoutService.previewResearchTarget({
        profileId,
        target: { repoUrl: input.repoUrl ?? `https://github.com/neon/${input.vcs}-commit.git` },
    });
    expect(materialized.isOk()).toBe(true);

    return materialized._unsafeUnwrap().researchTarget;
}

describe('repo commit service', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('previews and applies a guarded git commit only for the approved working tree digest', async () => {
        const statusOutput = '## main...origin/main\n M src/index.ts\n?? README.md\n';
        const researchTarget = await createMaterializedCheckout({ vcs: 'git', statusOutput });
        const { runner, calls } = scriptedRunner([
            { command: 'git', args: ['status', '--porcelain=v1', '--branch'], result: okCommand(statusOutput) },
            { command: 'git', args: ['status', '--porcelain=v1', '--branch'], result: okCommand(statusOutput) },
            { command: 'git', args: ['add', '-A', '--', '.'], result: okCommand('') },
            { command: 'git', args: ['commit', '-m', 'type: test commit'], result: okCommand('[main abcdef1] test\n') },
            { command: 'git', args: ['rev-parse', 'HEAD'], result: okCommand('111111111111\n') },
        ]);
        const service = new RepoCommitService(runner);
        const checkoutRecordId = requireCheckoutRecordId(researchTarget);

        const preview = await service.preview({
            profileId,
            researchCheckoutRecordId: checkoutRecordId,
            message: 'type: test commit',
        });

        expect(preview.isOk()).toBe(true);
        const previewValue = preview._unsafeUnwrap();
        expect(previewValue.available).toBe(true);
        expect(previewValue.guardrail).toMatchObject({ intent: 'commit', outcome: 'approval_required' });
        expect(previewValue.changeSummary).toMatchObject({
            changedFileCount: 2,
            changedPathSamples: ['src/index.ts', 'README.md'],
        });
        const expectedWorkingTreeDigest = requireWorkingTreeDigest(previewValue);
        expect(expectedWorkingTreeDigest).toMatch(/^[0-9a-f]{64}$/u);

        const applied = await service.apply({
            profileId,
            researchCheckoutRecordId: checkoutRecordId,
            message: 'type: test commit',
            expectedWorkingTreeDigest,
        });

        expect(applied.isOk()).toBe(true);
        expect(applied._unsafeUnwrap()).toMatchObject({
            committed: true,
            vcsFamily: 'git',
            revisionId: '111111111111',
            receipt: {
                command: 'git commit',
                exitCode: 0,
            },
        });
        expect(calls.map((call) => `${call.command} ${call.args.join(' ')}`)).toEqual([
            'git status --porcelain=v1 --branch',
            'git status --porcelain=v1 --branch',
            'git add -A -- .',
            'git commit -m type: test commit',
            'git rev-parse HEAD',
        ]);
    });

    it('blocks clean checkouts and invalid drifted apply attempts', async () => {
        const cleanTarget = await createMaterializedCheckout({
            vcs: 'git',
            statusOutput: '## main...origin/main\n',
            repoUrl: 'https://github.com/neon/clean-commit.git',
        });
        const cleanService = new RepoCommitService(runnerWithStdout('## main...origin/main\n'));
        const cleanPreview = await cleanService.preview({
            profileId,
            researchCheckoutRecordId: requireCheckoutRecordId(cleanTarget),
            message: 'type: clean commit',
        });
        expect(cleanPreview.isOk()).toBe(true);
        expect(cleanPreview._unsafeUnwrap()).toMatchObject({
            available: false,
            guardrail: { outcome: 'blocked' },
            changeSummary: { changedFileCount: 0 },
        });

        const originalStatus = '## main...origin/main\n M src/index.ts\n';
        const driftedStatus = '## main...origin/main\n M src/index.ts\n M src/other.ts\n';
        const dirtyTarget = await createMaterializedCheckout({
            vcs: 'git',
            statusOutput: originalStatus,
            repoUrl: 'https://github.com/neon/drift-commit.git',
        });
        const scripted = scriptedRunner([
            { command: 'git', args: ['status', '--porcelain=v1', '--branch'], result: okCommand(originalStatus) },
            { command: 'git', args: ['status', '--porcelain=v1', '--branch'], result: okCommand(driftedStatus) },
        ]);
        const dirtyService = new RepoCommitService(scripted.runner);
        const dirtyCheckoutRecordId = requireCheckoutRecordId(dirtyTarget);
        const dirtyPreview = await dirtyService.preview({
            profileId,
            researchCheckoutRecordId: dirtyCheckoutRecordId,
            message: 'type: dirty commit',
        });
        expect(dirtyPreview.isOk()).toBe(true);
        const dirtyExpectedDigest = requireWorkingTreeDigest(dirtyPreview._unsafeUnwrap());

        const driftedApply = await dirtyService.apply({
            profileId,
            researchCheckoutRecordId: dirtyCheckoutRecordId,
            message: 'type: dirty commit',
            expectedWorkingTreeDigest: dirtyExpectedDigest,
        });

        expect(driftedApply.isErr()).toBe(true);
        expect(driftedApply._unsafeUnwrapErr()).toMatchObject({
            code: 'mode_policy_invalid',
            message: 'Repo commit was blocked because the working tree changed after preview.',
        });
    });

    it('describes dirty jj working-copy changes without git-style staging or push operations', async () => {
        const statusOutput = 'Working copy changes:\nM src/index.ts\nA docs/notes.md\n';
        const researchTarget = await createMaterializedCheckout({ vcs: 'jj', statusOutput });
        const { runner, calls } = scriptedRunner([
            { command: 'jj', args: ['--no-pager', 'status'], result: okCommand(statusOutput) },
            { command: 'jj', args: ['--no-pager', 'status'], result: okCommand(statusOutput) },
            { command: 'jj', args: ['describe', '-m', 'type: describe change'], result: okCommand('') },
            {
                command: 'jj',
                args: ['--no-pager', 'log', '-r', '@', '--no-graph', '--color', 'never'],
                result: okCommand('zzzzzzzzzz abcdef123456 type: describe change\n'),
            },
        ]);
        const service = new RepoCommitService(runner);
        const checkoutRecordId = requireCheckoutRecordId(researchTarget);

        const preview = await service.preview({
            profileId,
            researchCheckoutRecordId: checkoutRecordId,
            message: 'type: describe change',
        });
        expect(preview.isOk()).toBe(true);
        expect(preview._unsafeUnwrap()).toMatchObject({
            available: true,
            vcsFamily: 'jj',
            changeSummary: {
                changedFileCount: 2,
                changedPathSamples: ['src/index.ts', 'docs/notes.md'],
            },
        });

        const applied = await service.apply({
            profileId,
            researchCheckoutRecordId: checkoutRecordId,
            message: 'type: describe change',
            expectedWorkingTreeDigest: requireWorkingTreeDigest(preview._unsafeUnwrap()),
        });
        expect(applied.isOk()).toBe(true);
        expect(applied._unsafeUnwrap()).toMatchObject({
            committed: true,
            vcsFamily: 'jj',
            revisionId: 'zzzzzzzzzz',
            receipt: { command: 'jj describe' },
        });
        expect(calls.map((call) => `${call.command} ${call.args.join(' ')}`)).toEqual([
            'jj --no-pager status',
            'jj --no-pager status',
            'jj describe -m type: describe change',
            'jj --no-pager log -r @ --no-graph --color never',
        ]);
    });
});
