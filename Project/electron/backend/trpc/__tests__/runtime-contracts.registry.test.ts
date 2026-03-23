import { describe, expect, it, vi } from 'vitest';


import {
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    getPersistence,
    mkdirSync,
    path,
    rmSync,
    waitForRunStatus,
    writeFileSync,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

function resetRegistryAssetDirectories(rootPath: string): void {
    rmSync(path.join(rootPath, 'modes'), { recursive: true, force: true });
    rmSync(path.join(rootPath, 'rules'), { recursive: true, force: true });
    rmSync(path.join(rootPath, 'skills'), { recursive: true, force: true });
}

describe('runtime contracts: registry and attached skills', () => {
    const profileId = runtimeContractProfileId;

    it('refreshes file-backed registry assets with precedence, search, and pruning', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_registry_contracts';

        const globalRegistry = await caller.registry.listResolved({ profileId });
        const globalAssetsRoot = globalRegistry.paths.globalAssetsRoot;
        resetRegistryAssetDirectories(globalAssetsRoot);
        mkdirSync(path.join(globalAssetsRoot, 'modes'), { recursive: true });
        mkdirSync(path.join(globalAssetsRoot, 'rules'), { recursive: true });
        mkdirSync(path.join(globalAssetsRoot, 'skills'), { recursive: true });

        writeFileSync(
            path.join(globalAssetsRoot, 'modes', 'review.md'),
            `---
modeKey: review
label: Global Review
description: Global registry mode
toolCapabilities:
  - filesystem_read
tags:
  - review
  - global
---
# Review Mode

- Review the active workspace carefully.
`,
            'utf8'
        );
        writeFileSync(
            path.join(globalAssetsRoot, 'modes', 'chat.md'),
            `---
topLevelTab: chat
modeKey: chat
label: Global Chat
description: Global chat mode override
---
# Global Chat Mode

- Keep the conversation broad and lightweight.
`,
            'utf8'
        );
        writeFileSync(
            path.join(globalAssetsRoot, 'rules', 'coding-rules.md'),
            `---
key: coding_rules
name: Global Rules
tags:
  - baseline
---
# Global Rules

- Keep the runtime deterministic.
`,
            'utf8'
        );
        writeFileSync(
            path.join(globalAssetsRoot, 'skills', 'repo-search.md'),
            `---
key: repo_search
name: Repo Search
description: Search the repository efficiently.
tags:
  - search
  - repo
---
# Repo Search

- Use ripgrep first.
`,
            'utf8'
        );
        writeFileSync(path.join(globalAssetsRoot, 'AGENTS.md'), '# Global agents root\n\nThis should not affect registry.', 'utf8');
        mkdirSync(path.join(globalAssetsRoot, '.agents'), { recursive: true });
        writeFileSync(
            path.join(globalAssetsRoot, '.agents', 'ignored.md'),
            '# Ignored modular agents\n\nThis should not be treated as a registry asset.',
            'utf8'
        );

        await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Registry workspace thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const workspaceRoots = await caller.runtime.listWorkspaceRoots({ profileId });
        const workspaceRoot = workspaceRoots.workspaceRoots.find((root) => root.fingerprint === workspaceFingerprint);
        if (!workspaceRoot) {
            throw new Error('Expected workspace root for registry contracts test.');
        }

        const workspaceAssetsRoot = path.join(workspaceRoot.absolutePath, '.neonconductor');
        mkdirSync(path.join(workspaceAssetsRoot, 'modes'), { recursive: true });
        mkdirSync(path.join(workspaceAssetsRoot, 'rules'), { recursive: true });
        mkdirSync(path.join(workspaceAssetsRoot, 'skills'), { recursive: true });

        writeFileSync(
            path.join(workspaceAssetsRoot, 'modes', 'review.md'),
            `---
modeKey: review
label: Workspace Review
description: Workspace override
whenToUse: Use when the workspace has stricter local constraints.
groups:
  - review
  - workspace
precedence: 5
toolCapabilities:
  - filesystem_read
tags:
  - review
  - workspace
---
# Workspace Review

- Prefer workspace-specific constraints.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceAssetsRoot, 'modes', 'orchestrator.md'),
            `---
topLevelTab: orchestrator
modeKey: workspace-orchestrator
label: Workspace Orchestrator
description: Workspace orchestrator override
precedence: 5
---
# Workspace Orchestrator

- Coordinate work from the workspace root first.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceAssetsRoot, 'modes', 'invalid.md'),
            `---
topLevelTab: shared
modeKey: invalid-shared
label: Invalid Shared Mode
---
# Invalid

- This should never load.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceAssetsRoot, 'modes', 'invalid-groups.md'),
            `---
topLevelTab: agent
modeKey: invalid-groups
label: Invalid Groups
groups: review
---
# Invalid Groups

- This should never load either.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceAssetsRoot, 'rules', 'coding-rules.md'),
            `---
key: coding_rules
name: Workspace Rules
precedence: 5
tags:
  - workspace
---
# Workspace Rules

- Follow the local workspace constraints first.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceAssetsRoot, 'skills', 'repo-search.md'),
            `---
key: repo_search
name: Workspace Search
precedence: 5
tags:
  - search
  - workspace
---
# Workspace Search

- Prefer workspace context when searching.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceRoot.absolutePath, 'AGENTS.md'),
            '# Workspace agents root\n\nThis should not affect registry counts.',
            'utf8'
        );
        mkdirSync(path.join(workspaceRoot.absolutePath, '.agents'), { recursive: true });
        writeFileSync(
            path.join(workspaceRoot.absolutePath, '.agents', 'ignored.md'),
            '# Ignored workspace modular agents\n\nThis should not be treated as a registry asset.',
            'utf8'
        );

        const globalRefresh = await caller.registry.refresh({ profileId });
        expect(globalRefresh.refreshed.global.modes).toBe(2);
        expect(globalRefresh.refreshed.global.rulesets).toBe(1);
        expect(globalRefresh.refreshed.global.skillfiles).toBe(1);

        const workspaceRefresh = await caller.registry.refresh({
            profileId,
            workspaceFingerprint,
        });
        expect(workspaceRefresh.refreshed.workspace?.modes).toBe(2);
        expect(workspaceRefresh.refreshed.workspace?.rulesets).toBe(1);
        expect(workspaceRefresh.refreshed.workspace?.skillfiles).toBe(1);

        const resolvedGlobal = await caller.registry.listResolved({ profileId });
        expect(
            resolvedGlobal.resolved.modes.find((mode) => mode.topLevelTab === 'agent' && mode.modeKey === 'review')
                ?.label
        ).toBe('Global Review');
        expect(
            resolvedGlobal.resolved.modes.find((mode) => mode.topLevelTab === 'chat' && mode.modeKey === 'chat')?.label
        ).toBe('Global Chat');
        expect(resolvedGlobal.resolved.skillfiles.some((skillfile) => skillfile.name === 'Workspace Search')).toBe(
            false
        );

        const resolvedWorkspace = await caller.registry.listResolved({
            profileId,
            workspaceFingerprint,
        });
        const resolvedWorkspaceReviewMode = resolvedWorkspace.resolved.modes.find(
            (mode) => mode.topLevelTab === 'agent' && mode.modeKey === 'review'
        );
        expect(resolvedWorkspaceReviewMode?.label).toBe('Workspace Review');
        expect(resolvedWorkspaceReviewMode?.executionPolicy.toolCapabilities).toEqual(['filesystem_read']);
        expect(resolvedWorkspaceReviewMode?.prompt.roleDefinition).toBeUndefined();
        expect(resolvedWorkspaceReviewMode?.prompt.customInstructions).toContain('Workspace Review');
        expect(resolvedWorkspaceReviewMode?.prompt.customInstructions).toContain(
            'Prefer workspace-specific constraints.'
        );
        expect(resolvedWorkspaceReviewMode?.whenToUse).toBe('Use when the workspace has stricter local constraints.');
        expect(resolvedWorkspaceReviewMode?.tags).toEqual(['review', 'workspace']);
        expect(
            resolvedWorkspace.resolved.modes.find(
                (mode) => mode.topLevelTab === 'orchestrator' && mode.modeKey === 'workspace-orchestrator'
            )?.label
        ).toBe('Workspace Orchestrator');
        expect(resolvedWorkspace.resolved.modes.some((mode) => mode.modeKey === 'invalid-shared')).toBe(false);
        expect(resolvedWorkspace.resolved.modes.some((mode) => mode.modeKey === 'invalid-groups')).toBe(false);
        expect(resolvedWorkspace.resolved.rulesets.find((ruleset) => ruleset.assetKey === 'coding_rules')?.name).toBe(
            'Workspace Rules'
        );
        expect(
            resolvedWorkspace.resolved.skillfiles.find((skillfile) => skillfile.assetKey === 'repo_search')?.name
        ).toBe('Workspace Search');

        const searchedSkills = await caller.registry.searchSkills({
            profileId,
            workspaceFingerprint,
            query: 'workspace',
        });
        expect(searchedSkills.skillfiles.map((skillfile) => skillfile.name)).toContain('Workspace Search');

        const workspaceModes = await caller.mode.list({
            profileId,
            topLevelTab: 'agent',
            workspaceFingerprint,
        });
        expect(workspaceModes.modes.some((mode) => mode.modeKey === 'review' && mode.label === 'Workspace Review')).toBe(
            true
        );
        const chatModes = await caller.mode.list({
            profileId,
            topLevelTab: 'chat',
            workspaceFingerprint,
        });
        expect(chatModes.modes.find((mode) => mode.modeKey === 'chat')?.label).toBe('Global Chat');
        const orchestratorModes = await caller.mode.list({
            profileId,
            topLevelTab: 'orchestrator',
            workspaceFingerprint,
        });
        expect(orchestratorModes.modes.find((mode) => mode.modeKey === 'workspace-orchestrator')?.label).toBe(
            'Workspace Orchestrator'
        );

        const activated = await caller.mode.setActive({
            profileId,
            topLevelTab: 'agent',
            workspaceFingerprint,
            modeKey: 'review',
        });
        expect(activated.updated).toBe(true);
        if (!activated.updated) {
            throw new Error('Expected custom workspace mode activation to succeed.');
        }

        const activeMode = await caller.mode.getActive({
            profileId,
            topLevelTab: 'agent',
            workspaceFingerprint,
        });
        expect(activeMode.activeMode.modeKey).toBe('review');
        expect(activeMode.activeMode.label).toBe('Workspace Review');

        const chatActivated = await caller.mode.setActive({
            profileId,
            topLevelTab: 'chat',
            workspaceFingerprint,
            modeKey: 'chat',
        });
        expect(chatActivated.updated).toBe(true);
        if (!chatActivated.updated) {
            throw new Error('Expected global chat mode activation to succeed.');
        }

        const orchestratorActivated = await caller.mode.setActive({
            profileId,
            topLevelTab: 'orchestrator',
            workspaceFingerprint,
            modeKey: 'workspace-orchestrator',
        });
        expect(orchestratorActivated.updated).toBe(true);
        if (!orchestratorActivated.updated) {
            throw new Error('Expected workspace orchestrator mode activation to succeed.');
        }

        const chatActiveMode = await caller.mode.getActive({
            profileId,
            topLevelTab: 'chat',
            workspaceFingerprint,
        });
        expect(chatActiveMode.activeMode.modeKey).toBe('chat');
        expect(chatActiveMode.activeMode.label).toBe('Global Chat');

        const orchestratorActiveMode = await caller.mode.getActive({
            profileId,
            topLevelTab: 'orchestrator',
            workspaceFingerprint,
        });
        expect(orchestratorActiveMode.activeMode.modeKey).toBe('workspace-orchestrator');
        expect(orchestratorActiveMode.activeMode.label).toBe('Workspace Orchestrator');

        rmSync(path.join(workspaceAssetsRoot, 'skills', 'repo-search.md'));
        const prunedRefresh = await caller.registry.refresh({
            profileId,
            workspaceFingerprint,
        });
        expect(prunedRefresh.refreshed.workspace?.skillfiles).toBe(0);

        const prunedResolved = await caller.registry.listResolved({
            profileId,
            workspaceFingerprint,
        });
        expect(
            prunedResolved.resolved.skillfiles.find((skillfile) => skillfile.assetKey === 'repo_search')?.name
        ).toBe('Repo Search');
    });

    it('refreshing discovered non-agent modes does not delete built-ins, prompt overrides, or unrelated active settings', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_registry_non_agent_refresh';

        await caller.prompt.setBuiltInModePrompt({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'chat',
            roleDefinition: 'Built-in chat role override',
            customInstructions: 'Built-in chat custom override',
        });

        const globalRegistry = await caller.registry.listResolved({ profileId });
        const globalAssetsRoot = globalRegistry.paths.globalAssetsRoot;
        resetRegistryAssetDirectories(globalAssetsRoot);
        mkdirSync(path.join(globalAssetsRoot, 'modes'), { recursive: true });
        writeFileSync(
            path.join(globalAssetsRoot, 'modes', 'chat.md'),
            `---
topLevelTab: chat
modeKey: chat
label: Global File Chat
precedence: 5
---
# Global File Chat

- Override the built-in chat mode from the global registry.
`,
            'utf8'
        );

        await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Registry refresh state guard',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const workspaceRoots = await caller.runtime.listWorkspaceRoots({ profileId });
        const workspaceRoot = workspaceRoots.workspaceRoots.find((root) => root.fingerprint === workspaceFingerprint);
        if (!workspaceRoot) {
            throw new Error('Expected workspace root for non-agent refresh guard test.');
        }

        const workspaceAssetsRoot = path.join(workspaceRoot.absolutePath, '.neonconductor');
        mkdirSync(path.join(workspaceAssetsRoot, 'modes'), { recursive: true });
        writeFileSync(
            path.join(workspaceAssetsRoot, 'modes', 'orchestrate.md'),
            `---
topLevelTab: orchestrator
modeKey: orchestrate
label: Workspace File Orchestrate
precedence: 5
---
# Workspace File Orchestrate

- Override the built-in orchestrate mode from the workspace registry.
`,
            'utf8'
        );

        await caller.registry.refresh({ profileId });
        await caller.registry.refresh({ profileId, workspaceFingerprint });

        const chatActivated = await caller.mode.setActive({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'chat',
        });
        expect(chatActivated.updated).toBe(true);
        if (!chatActivated.updated) {
            throw new Error('Expected custom chat mode activation to succeed.');
        }

        const orchestratorActivated = await caller.mode.setActive({
            profileId,
            topLevelTab: 'orchestrator',
            workspaceFingerprint,
            modeKey: 'orchestrate',
        });
        expect(orchestratorActivated.updated).toBe(true);
        if (!orchestratorActivated.updated) {
            throw new Error('Expected custom orchestrator mode activation to succeed.');
        }

        rmSync(path.join(workspaceAssetsRoot, 'modes', 'orchestrate.md'));
        await caller.registry.refresh({ profileId, workspaceFingerprint });

        const builtInChat = await caller.mode.getActive({
            profileId,
            topLevelTab: 'chat',
        });
        expect(builtInChat.activeMode.modeKey).toBe('chat');
        expect(builtInChat.activeMode.label).toBe('Global File Chat');
        expect(builtInChat.activeMode.prompt).toEqual({
            customInstructions: '# Global File Chat\n\n- Override the built-in chat mode from the global registry.',
        });

        const promptSettings = await caller.prompt.getSettings({ profileId });
        expect(promptSettings.settings.builtInModes.chat.find((mode) => mode.modeKey === 'chat')).toEqual({
            topLevelTab: 'chat',
            modeKey: 'chat',
            label: 'Chat',
            prompt: {
                roleDefinition: 'Built-in chat role override',
                customInstructions: 'Built-in chat custom override',
            },
            hasOverride: true,
        });

        const orchestratorAfterPrune = await caller.mode.getActive({
            profileId,
            topLevelTab: 'orchestrator',
            workspaceFingerprint,
        });
        expect(orchestratorAfterPrune.activeMode.modeKey).toBe('orchestrate');
        expect(orchestratorAfterPrune.activeMode.label).toBe('Orchestrator Orchestrate');

        const agentAfterPrune = await caller.mode.getActive({
            profileId,
            topLevelTab: 'agent',
            workspaceFingerprint,
        });
        expect(agentAfterPrune.activeMode.modeKey).toBe('code');
    });


    it('assembles agent run context from resolved modes, rules, and attached skills', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_registry_agent_context';
        const requestBodies: Array<Record<string, unknown>> = [];
        vi.stubGlobal(
            'fetch',
            vi.fn((_url: string, init?: RequestInit) => {
                const body = init?.body;
                if (typeof body === 'string') {
                    requestBodies.push(JSON.parse(body) as Record<string, unknown>);
                }

                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'Registry-backed agent response',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 15,
                            completion_tokens: 9,
                            total_tokens: 24,
                        },
                    }),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-registry-agent-key',
        });
        expect(configured.success).toBe(true);

        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('openai/review-chat-test', 'openai', 'Review Chat Test', now, now);
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO provider_model_catalog
                        (
                            profile_id,
                            provider_id,
                            model_id,
                            label,
                            upstream_provider,
                            is_free,
                            supports_tools,
                            supports_reasoning,
                            supports_vision,
                            supports_audio_input,
                            supports_audio_output,
                            tool_protocol,
                            api_family,
                            input_modalities_json,
                            output_modalities_json,
                            prompt_family,
                            context_length,
                            pricing_json,
                            raw_json,
                            source,
                            updated_at
                        )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                profileId,
                'openai',
                'openai/review-chat-test',
                'Review Chat Test',
                'openai',
                0,
                1,
                1,
                0,
                0,
                0,
                'openai_chat_completions',
                'openai_compatible',
                JSON.stringify(['text']),
                JSON.stringify(['text']),
                null,
                128000,
                '{}',
                '{}',
                'test',
                now
            );

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Registry Agent Context',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const registryPaths = await caller.registry.listResolved({
            profileId,
            workspaceFingerprint,
        });
        const globalAssetsRoot = registryPaths.paths.globalAssetsRoot;
        const workspaceAssetsRoot = registryPaths.paths.workspaceAssetsRoot;
        if (!workspaceAssetsRoot) {
            throw new Error('Expected workspace asset root for registry-backed agent context test.');
        }

        resetRegistryAssetDirectories(globalAssetsRoot);
        resetRegistryAssetDirectories(workspaceAssetsRoot);
        mkdirSync(path.join(globalAssetsRoot, 'modes'), { recursive: true });
        mkdirSync(path.join(globalAssetsRoot, 'rules'), { recursive: true });
        mkdirSync(path.join(globalAssetsRoot, 'skills'), { recursive: true });
        mkdirSync(path.join(workspaceAssetsRoot, 'modes'), { recursive: true });
        mkdirSync(path.join(workspaceAssetsRoot, 'rules'), { recursive: true });
        mkdirSync(path.join(workspaceAssetsRoot, 'skills'), { recursive: true });

        writeFileSync(
            path.join(globalAssetsRoot, 'modes', 'review.md'),
            `---
modeKey: review
label: Global Review
toolCapabilities:
  - filesystem_read
---
# Global Review Mode

- This global review mode should be overridden.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceAssetsRoot, 'modes', 'review.md'),
            `---
modeKey: review
label: Workspace Review
precedence: 5
toolCapabilities:
  - filesystem_read
---
# Workspace Review Mode

- Prefer workspace-specific review instructions.
`,
            'utf8'
        );
        writeFileSync(
            path.join(globalAssetsRoot, 'rules', 'coding-rules.md'),
            `---
key: coding_rules
name: Global Rules
---
# Global Rules

- This global rule should be overridden.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceAssetsRoot, 'rules', 'coding-rules.md'),
            `---
key: coding_rules
name: Workspace Rules
precedence: 5
---
# Workspace Rules

- Enforce the local repository constraints first.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceAssetsRoot, 'skills', 'repo-search.md'),
            `---
key: repo_search
name: Workspace Search
---
# Workspace Search

- Use ripgrep from the workspace root first.
`,
            'utf8'
        );
        writeFileSync(
            path.join(globalAssetsRoot, 'skills', 'docs-lookup.md'),
            `---
key: docs_lookup
name: Docs Lookup
---
# Docs Lookup

- This skill is available but should stay unattached.
`,
            'utf8'
        );

        const refreshed = await caller.registry.refresh({
            profileId,
            workspaceFingerprint,
        });
        expect(refreshed.refreshed.workspace?.modes).toBe(1);
        expect(refreshed.refreshed.workspace?.rulesets).toBe(1);
        expect(refreshed.refreshed.workspace?.skillfiles).toBe(1);

        const attached = await caller.session.setAttachedSkills({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'review',
            assetKeys: ['repo_search'],
        });
        expect(attached.skillfiles.map((skillfile: { assetKey: string }) => skillfile.assetKey)).toEqual(['repo_search']);

        const attachedSkills = await caller.session.getAttachedSkills({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'review',
        });
        expect(attachedSkills.skillfiles.map((skillfile: { name: string }) => skillfile.name)).toEqual(['Workspace Search']);
        expect(attachedSkills.missingAssetKeys).toBeUndefined();

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Review the changed files',
            topLevelTab: 'agent',
            modeKey: 'review',
            workspaceFingerprint,
            runtimeOptions: {
                ...defaultRuntimeOptions,
                transport: {
                    family: 'openai_chat_completions',
                },
            },
            providerId: 'openai',
            modelId: 'openai/review-chat-test',
        });
        if (!started.accepted) {
            throw new Error(`Expected registry-backed agent run to start. ${JSON.stringify(started)}`);
        }
        expect(started.accepted).toBe(true);
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const requestBody = requestBodies.at(-1);
        expect(requestBody).toBeDefined();
        if (!requestBody) {
            throw new Error('Expected provider request body for registry-backed agent run.');
        }
        const messages = requestBody['messages'];
        expect(Array.isArray(messages)).toBe(true);
        if (!Array.isArray(messages)) {
            throw new Error('Expected chat completions request messages array.');
        }
        const contents = messages
            .map((message) => {
                if (typeof message !== 'object' || message === null) {
                    return '';
                }
                const content = (message as { content?: unknown }).content;
                return typeof content === 'string' ? content : '';
            })
            .filter((content) => content.length > 0);

        expect(contents.some((content) => content.includes('Workspace Review Mode'))).toBe(true);
        expect(contents.some((content) => content.includes('Workspace Rules'))).toBe(true);
        expect(contents.some((content) => content.includes('Workspace Search'))).toBe(true);
        expect(contents.some((content) => content.includes('Review the changed files'))).toBe(true);
        expect(contents.some((content) => content.includes('Docs Lookup'))).toBe(false);
        expect(contents.some((content) => content.includes('Global Review Mode'))).toBe(false);
        expect(contents.some((content) => content.includes('This global rule should be overridden'))).toBe(false);

        rmSync(path.join(workspaceAssetsRoot, 'skills', 'repo-search.md'));
        await caller.registry.refresh({
            profileId,
            workspaceFingerprint,
        });

        const afterPrune = await caller.session.getAttachedSkills({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'review',
        });
        expect(afterPrune.skillfiles).toEqual([]);
        expect(afterPrune.missingAssetKeys).toEqual(['repo_search']);

        const blockedRun = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Try the missing skill again',
            topLevelTab: 'agent',
            modeKey: 'review',
            workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(blockedRun.accepted).toBe(false);
        if (blockedRun.accepted) {
            throw new Error('Expected missing attached skill to block the run.');
        }
        expect(blockedRun.code).toBe('invalid_payload');
        expect(blockedRun.message).toContain('repo_search');

        const detached = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Detached Skill Guard',
            kind: 'local',
        });
        await expect(
            caller.session.setAttachedSkills({
                profileId,
                sessionId: detached.session.id,
                topLevelTab: 'agent',
                modeKey: 'review',
                assetKeys: ['repo_search'],
            })
        ).rejects.toThrow('repo_search');
    });

});
