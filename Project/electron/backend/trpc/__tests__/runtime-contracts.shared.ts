import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';

import { getDefaultProfileId, getPersistence, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { providerCatalogStore } from '@/app/backend/persistence/stores';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { initializeSecretStore } from '@/app/backend/secrets/store';
import type { Context } from '@/app/backend/trpc/context';
import { appRouter } from '@/app/backend/trpc/router';

export function createCaller() {
    const context: Context = {
        senderId: 1,
        win: null,
        requestId: 'test-request-id',
        correlationId: 'test-correlation-id',
    };

    return appRouter.createCaller(context);
}

export function isEntityId<P extends string>(value: string, prefix: P): value is `${P}_${string}` {
    return value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}

export function requireEntityId<P extends string>(value: string | undefined, prefix: P, message: string): `${P}_${string}` {
    if (!value || !isEntityId(value, prefix)) {
        throw new Error(message);
    }

    return value;
}

export function createGitWorkspace(prefix: string): string {
    const workspacePath = mkdtempSync(path.join(os.tmpdir(), prefix));
    execFileSync('git', ['init'], { cwd: workspacePath, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspacePath, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Neon Conductor Tests'], { cwd: workspacePath, stdio: 'ignore' });
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: workspacePath, stdio: 'ignore' });
    writeFileSync(path.join(workspacePath, 'README.md'), 'base\n');
    execFileSync('git', ['add', 'README.md'], { cwd: workspacePath, stdio: 'ignore' });
    execFileSync('git', ['commit', '--no-gpg-sign', '-m', 'initial'], { cwd: workspacePath, stdio: 'ignore' });
    return workspacePath;
}

export async function createSessionInScope(
    caller: ReturnType<typeof createCaller>,
    profileId: string,
    input: {
        scope: 'detached' | 'workspace';
        workspaceFingerprint?: string;
        title: string;
        kind: 'local' | 'worktree' | 'cloud';
        topLevelTab?: 'chat' | 'agent' | 'orchestrator';
    }
) {
    let workspacePath: string | undefined;
    if (input.scope === 'workspace' && input.workspaceFingerprint) {
        workspacePath = mkdtempSync(path.join(os.tmpdir(), `${input.workspaceFingerprint}-`));
        const now = new Date().toISOString();
        const { sqlite } = getPersistence();
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO workspace_roots
                        (fingerprint, profile_id, absolute_path, path_key, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                input.workspaceFingerprint,
                profileId,
                workspacePath,
                process.platform === 'win32' ? workspacePath.toLowerCase() : workspacePath,
                path.basename(workspacePath),
                now,
                now
            );
    }

    const threadResult = await caller.conversation.createThread({
        profileId,
        ...(input.topLevelTab ? { topLevelTab: input.topLevelTab } : {}),
        scope: input.scope,
        ...(workspacePath ? { workspacePath } : {}),
        title: input.title,
    });

    const sessionResult = await caller.session.create({
        profileId,
        threadId: (() => {
            if (!isEntityId(threadResult.thread.id, 'thr')) {
                throw new Error('Expected thread id with "thr_" prefix.');
            }
            return threadResult.thread.id;
        })(),
        kind: input.kind,
    });
    if (!sessionResult.created) {
        throw new Error(`Expected session creation success, received "${sessionResult.reason}".`);
    }

    return {
        thread: threadResult.thread,
        session: sessionResult.session,
    };
}

export async function waitForRunStatus(
    caller: ReturnType<typeof createCaller>,
    profileId: string,
    sessionId: EntityId<'sess'>,
    expected: 'completed' | 'aborted' | 'error'
): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
        const status = await caller.session.status({ profileId, sessionId });
        if (status.found && status.session.runStatus === expected) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`Timed out waiting for session ${sessionId} to reach status "${expected}".`);
}

export async function waitForOrchestratorStatus(
    caller: ReturnType<typeof createCaller>,
    profileId: string,
    orchestratorRunId: EntityId<'orch'>,
    expected: 'completed' | 'aborted' | 'failed'
): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const status = await caller.orchestrator.status({ profileId, orchestratorRunId });
        if (status.found && status.run.status === expected) {
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 40));
    }

    throw new Error(`Timed out waiting for orchestrator run ${orchestratorRunId} to reach status "${expected}".`);
}

export function registerRuntimeContractHooks() {
    beforeEach(() => {
        resetPersistenceForTests();
        initializeSecretStore();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });
}

export const runtimeContractProfileId = getDefaultProfileId();

export const defaultRuntimeOptions = {
    reasoning: {
        effort: 'medium' as const,
        summary: 'auto' as const,
        includeEncrypted: true,
    },
    cache: {
        strategy: 'auto' as const,
    },
    transport: {
        family: 'auto' as const,
    },
};

export type { EntityId };

export {
    execFileSync,
    getPersistence,
    providerCatalogStore,
    resetPersistenceForTests,
    mkdirSync,
    mkdtempSync,
    os,
    path,
    readFileSync,
    rmSync,
    writeFileSync,
};
