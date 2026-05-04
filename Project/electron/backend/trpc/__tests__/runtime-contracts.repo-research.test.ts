import { describe, expect, it } from 'vitest';

import { providerAuthStore } from '@/app/backend/persistence/stores';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { getSecretStore } from '@/app/backend/secrets/store';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    mkdtempSync,
    os,
    path,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: repo-research acceptance', () => {
    const profileId = runtimeContractProfileId;

    it('exposes profile-scoped root settings and previews deterministic checkout targets', async () => {
        const caller = createCaller();
        const checkoutRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-runtime-research-root-'));

        const defaultSettings = await caller.runtime.getResearchCheckoutRootSettings({ profileId });
        expect(defaultSettings.settings).toMatchObject({
            profileId,
            policy: 'os_temp',
        });

        const savedSettings = await caller.runtime.setResearchCheckoutRootSettings({
            profileId,
            policy: 'custom_path',
            customAbsolutePath: checkoutRoot,
        });
        expect(savedSettings.settings).toMatchObject({
            profileId,
            policy: 'custom_path',
            customAbsolutePath: path.resolve(checkoutRoot),
        });

        const workspaceRootsBefore = await caller.runtime.listWorkspaceRoots({ profileId });
        const preview = await caller.runtime.previewResearchTarget({
            profileId,
            target: {
                repoUrl: 'https://github.com/neon/conductor.git',
                requestedTarget: { kind: 'branch', name: 'main' },
            },
        });
        const workspaceRootsAfter = await caller.runtime.listWorkspaceRoots({ profileId });

        expect(preview.researchTarget).toMatchObject({
            rootPolicy: 'custom_path',
            checkoutAction: 'clone_required',
            updateAction: 'unavailable',
            locator: {
                canonicalKey: 'https://github.com/neon/conductor',
                sanitizedUrl: 'https://github.com/neon/conductor.git',
            },
            requested: {
                repoUrl: 'https://github.com/neon/conductor.git',
                requestedTarget: { kind: 'branch', name: 'main' },
            },
        });
        expect(preview.researchTarget.targetSwitchAction).toBe('pause_for_review');
        expect(preview.researchTarget.resolvedCheckoutPath).toContain(path.resolve(checkoutRoot));
        expect(preview.researchTarget.checkoutRecordId).toMatch(/^rch_/u);
        expect(workspaceRootsAfter.workspaceRoots).toEqual(workspaceRootsBefore.workspaceRoots);
    });

    it('records research targets in run-contract previews and queued outbox entries', async () => {
        const caller = createCaller();
        await providerAuthStore.upsert({
            profileId,
            providerId: 'openai',
            authMethod: 'api_key',
            authState: 'authenticated',
        });
        await getSecretStore().setValue({
            profileId,
            providerId: 'openai',
            secretKind: 'api_key',
            secretValue: 'test-openai-key',
        });
        const checkoutRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-runtime-research-root-'));
        await caller.runtime.setResearchCheckoutRootSettings({
            profileId,
            policy: 'custom_path',
            customAbsolutePath: checkoutRoot,
        });
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_repo_research_contracts',
            title: 'Repo research',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const researchTarget = {
            repoUrl: 'https://github.com/neon/conductor.git',
            requestedTarget: { kind: 'default_branch' as const },
        };

        const preview = await caller.session.previewRunContract({
            profileId,
            sessionId: created.session.id,
            prompt: 'Inspect the repository architecture.',
            topLevelTab: 'agent',
            modeKey: 'research',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            researchTarget,
        });
        if (!preview.available) {
            throw new Error(`Expected repo-research run-contract preview to be available: ${JSON.stringify(preview)}`);
        }
        expect(preview.preview.executionTarget.kind).toBe('research_checkout');
        expect(preview.preview.researchTarget).toMatchObject({
            checkoutAction: 'clone_required',
            mutationGuardrail: { intent: 'inspect', outcome: 'safe_to_proceed' },
        });
        expect(preview.preview.steeringSnapshot.researchTarget).toEqual(researchTarget);

        const queued = await caller.session.queueRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Inspect the repository architecture.',
            topLevelTab: 'agent',
            modeKey: 'research',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            researchTarget,
        });
        expect(queued.entry.latestRunContract?.executionTarget.kind).toBe('research_checkout');
        expect(queued.entry.latestRunContract?.researchTarget?.checkoutAction).toBe('clone_required');
        expect(queued.entry.steeringSnapshot.researchTarget).toEqual(researchTarget);
    });

    it('fails closed for unavailable checkouts and rejects research targets outside agent.research', async () => {
        const caller = createCaller();
        const checkoutRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-runtime-research-root-'));
        await caller.runtime.setResearchCheckoutRootSettings({
            profileId,
            policy: 'custom_path',
            customAbsolutePath: checkoutRoot,
        });
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_repo_research_rejects',
            title: 'Repo research',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const researchTarget = {
            repoUrl: 'https://github.com/neon/conductor.git',
        };

        const unavailableStart = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Inspect the repository architecture.',
            topLevelTab: 'agent',
            modeKey: 'research',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            researchTarget,
        });
        expect(unavailableStart.accepted).toBe(false);
        if (unavailableStart.accepted) {
            throw new Error('Expected missing repo-research checkout to reject run start.');
        }
        expect(unavailableStart.code).toBe('execution_target_unavailable');
        expect(unavailableStart.action).toMatchObject({
            code: 'execution_target_unavailable',
            target: 'research_checkout',
            detail: 'checkout_missing',
        });

        const invalidMode = await caller.session.previewRunContract({
            profileId,
            sessionId: created.session.id,
            prompt: 'Inspect the repository architecture.',
            topLevelTab: 'agent',
            modeKey: 'ask',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            researchTarget,
        });
        expect(invalidMode.available).toBe(false);
        if (invalidMode.available) {
            throw new Error('Expected repo-research target outside agent.research to be rejected.');
        }
        expect(invalidMode.code).toBe('invalid_mode');
    });

    it('exposes guarded commit endpoints without inventing missing checkout records', async () => {
        const caller = createCaller();
        const missingCheckoutId = createEntityId('rch');

        await expect(
            caller.runtime.previewRepoCommit({
                profileId,
                researchCheckoutRecordId: missingCheckoutId,
                message: 'type: test commit',
            })
        ).rejects.toThrow('Repo-research checkout record was not found.');

        await expect(
            caller.runtime.previewRepoPush({
                profileId,
                researchCheckoutRecordId: missingCheckoutId,
            })
        ).rejects.toThrow('Repo-research checkout record was not found.');
    });
});
