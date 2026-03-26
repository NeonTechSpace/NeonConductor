import { describe, expect, it } from 'vitest';

import {
    createCaller,
    createSessionInScope,
    getPersistence,
    mkdirSync,
    path,
    readFileSync,
    registerRuntimeContractHooks,
    rmSync,
    runtimeContractProfileId,
    writeFileSync,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: prompt layers', () => {
    const profileId = runtimeContractProfileId;

    it('persists and resets app, profile, and top-level prompt layers', async () => {
        const caller = createCaller();

        const initialSettings = await caller.prompt.getSettings({ profileId });
        expect(initialSettings.settings.appGlobalInstructions).toBe('');
        expect(initialSettings.settings.profileGlobalInstructions).toBe('');
        expect(initialSettings.settings.topLevelInstructions).toEqual({
            chat: '',
            agent: '',
            orchestrator: '',
        });
        expect(initialSettings.settings.fileBackedCustomModes).toEqual({
            global: {
                chat: [],
                agent: [],
                orchestrator: [],
            },
        });
        expect(initialSettings.settings.builtInModes.chat).toEqual([
            {
                topLevelTab: 'chat',
                modeKey: 'chat',
                label: 'Chat',
                prompt: {},
                hasOverride: false,
            },
        ]);
        expect(initialSettings.settings.builtInModes.agent.map((mode) => mode.modeKey)).toEqual([
            'plan',
            'ask',
            'code',
            'debug',
        ]);
        expect(initialSettings.settings.builtInModes.orchestrator.map((mode) => mode.modeKey)).toEqual([
            'plan',
            'orchestrate',
            'debug',
        ]);

        const savedAppSettings = await caller.prompt.setAppGlobalInstructions({
            profileId,
            value: 'Use concise system behavior.',
        });
        expect(savedAppSettings.settings.appGlobalInstructions).toBe('Use concise system behavior.');

        const savedProfileSettings = await caller.prompt.setProfileGlobalInstructions({
            profileId,
            value: 'Bias toward this profile context.',
        });
        expect(savedProfileSettings.settings.profileGlobalInstructions).toBe('Bias toward this profile context.');

        const savedTopLevelSettings = await caller.prompt.setTopLevelInstructions({
            profileId,
            topLevelTab: 'chat',
            value: 'Chat should stay lightweight.',
        });
        expect(savedTopLevelSettings.settings.topLevelInstructions.chat).toBe('Chat should stay lightweight.');

        const resetTopLevelSettings = await caller.prompt.resetTopLevelInstructions({
            profileId,
            topLevelTab: 'chat',
        });
        expect(resetTopLevelSettings.settings.topLevelInstructions.chat).toBe('');

        const savedBuiltInModeSettings = await caller.prompt.setBuiltInModePrompt({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'code',
            roleDefinition: 'Act as the shipped coding specialist.',
            customInstructions: 'Always explain the change plan before editing.',
        });
        expect(savedBuiltInModeSettings.settings.builtInModes.agent.find((mode) => mode.modeKey === 'code')).toEqual({
            topLevelTab: 'agent',
            modeKey: 'code',
            label: 'Agent Code',
            prompt: {
                roleDefinition: 'Act as the shipped coding specialist.',
                customInstructions: 'Always explain the change plan before editing.',
            },
            hasOverride: true,
        });

        const resetBuiltInModeSettings = await caller.prompt.resetBuiltInModePrompt({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        expect(resetBuiltInModeSettings.settings.builtInModes.agent.find((mode) => mode.modeKey === 'code')).toEqual({
            topLevelTab: 'agent',
            modeKey: 'code',
            label: 'Agent Code',
            prompt: {},
            hasOverride: false,
        });

        const resetProfileSettings = await caller.prompt.resetProfileGlobalInstructions({ profileId });
        expect(resetProfileSettings.settings.profileGlobalInstructions).toBe('');

        const resetAppSettings = await caller.prompt.resetAppGlobalInstructions({ profileId });
        expect(resetAppSettings.settings.appGlobalInstructions).toBe('');
    });

    it('fails closed on malformed persisted prompt-layer records', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO settings (id, profile_id, key, value_json, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run(
                'setting_prompt_layer_profile_global_invalid',
                profileId,
                'prompt_layer.profile_global_instructions',
                '42',
                now
            );
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO settings (id, profile_id, key, value_json, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('setting_prompt_layer_top_level_invalid', profileId, 'prompt_layer.top_level.agent', 'false', now);
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO built_in_mode_prompt_overrides
                        (profile_id, top_level_tab, mode_key, prompt_json, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run(profileId, 'agent', 'code', '{"roleDefinition":42,"customInstructions":false}', now);
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO app_prompt_layer_settings (id, global_instructions, updated_at)
                    VALUES (?, ?, ?)
                `
            )
            .run('global', '', now);

        const settings = await caller.prompt.getSettings({ profileId });
        expect(settings.settings.appGlobalInstructions).toBe('');
        expect(settings.settings.profileGlobalInstructions).toBe('');
        expect(settings.settings.topLevelInstructions.agent).toBe('');
        expect(settings.settings.builtInModes.agent.find((mode) => mode.modeKey === 'code')).toEqual({
            topLevelTab: 'agent',
            modeKey: 'code',
            label: 'Agent Code',
            prompt: {},
            hasOverride: true,
        });
    });

    it('does not apply built-in overrides to a shadowing custom mode', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        const insertCustomMode = sqlite.prepare(
            `
                INSERT INTO mode_definitions (
                    id, profile_id, top_level_tab, mode_key, label, asset_key, prompt_json,
                    execution_policy_json, source, source_kind, scope, workspace_fingerprint,
                    origin_path, description, tags_json, enabled, precedence, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
        );

        insertCustomMode.run(
            'mode_custom_agent_code',
            profileId,
            'agent',
            'code',
            'Custom Agent Code',
            'custom_agent_code',
            JSON.stringify({ customInstructions: 'Workspace-owned custom code mode.' }),
            JSON.stringify({ toolCapabilities: ['filesystem_read'] }),
            'user',
            'global_file',
            'global',
            null,
            'C:/registry/modes/code.md',
            'Custom code mode',
            '[]',
            1,
            10,
            now,
            now
        );
        insertCustomMode.run(
            'mode_custom_chat_chat',
            profileId,
            'chat',
            'chat',
            'Custom Chat',
            'custom_chat_chat',
            JSON.stringify({ customInstructions: 'Custom chat mode instructions.' }),
            JSON.stringify({}),
            'user',
            'global_file',
            'global',
            null,
            'C:/registry/modes/chat.md',
            'Custom chat mode',
            '[]',
            1,
            10,
            now,
            now
        );

        await caller.prompt.setBuiltInModePrompt({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'code',
            roleDefinition: 'Built-in role override',
            customInstructions: 'Built-in custom override',
        });
        await caller.prompt.setBuiltInModePrompt({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'chat',
            roleDefinition: 'Built-in chat role override',
            customInstructions: 'Built-in chat custom override',
        });

        const agentModes = await caller.mode.list({
            profileId,
            topLevelTab: 'agent',
        });
        expect(agentModes.modes.find((mode) => mode.modeKey === 'code')).toEqual(
            expect.objectContaining({
                label: 'Custom Agent Code',
                prompt: {
                    customInstructions: 'Workspace-owned custom code mode.',
                },
            })
        );

        const chatModes = await caller.mode.list({
            profileId,
            topLevelTab: 'chat',
        });
        expect(chatModes.modes.find((mode) => mode.modeKey === 'chat')).toEqual(
            expect.objectContaining({
                label: 'Custom Chat',
                prompt: {
                    customInstructions: 'Custom chat mode instructions.',
                },
            })
        );
    });

    it('imports and exports text-based file-backed custom modes without mutating unrelated settings', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_prompt_portability';

        await caller.prompt.setBuiltInModePrompt({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'chat',
            roleDefinition: 'Built-in chat role override',
            customInstructions: 'Built-in chat custom override',
        });

        const globalRegistry = await caller.registry.listResolved({ profileId });
        const globalModesRoot = path.join(globalRegistry.paths.globalAssetsRoot, 'modes');
        rmSync(globalModesRoot, { recursive: true, force: true });
        mkdirSync(globalModesRoot, { recursive: true });

        const importedGlobal = await caller.prompt.importCustomMode({
            profileId,
            topLevelTab: 'chat',
            scope: 'global',
            jsonText: JSON.stringify({
                slug: 'review',
                name: 'Portable Review',
                description: 'Global chat review mode',
                roleDefinition: 'Act as a precise reviewer.',
                customInstructions: 'Review the current conversation carefully.',
                whenToUse: 'Use when a conversation needs a strict review pass.',
                groups: ['read', 'command'],
            }),
            overwrite: false,
        });
        expect(importedGlobal.settings.fileBackedCustomModes.global.chat).toEqual([
            {
                topLevelTab: 'chat',
                modeKey: 'review',
                label: 'Portable Review',
                description: 'Global chat review mode',
                whenToUse: 'Use when a conversation needs a strict review pass.',
                toolCapabilities: ['filesystem_read', 'shell'],
            },
        ]);
        expect(importedGlobal.settings.builtInModes.chat.find((mode) => mode.modeKey === 'chat')?.prompt).toEqual({
            roleDefinition: 'Built-in chat role override',
            customInstructions: 'Built-in chat custom override',
        });

        const globalModeFile = path.join(globalModesRoot, 'chat-review.md');
        const globalModeMarkdown = readFileSync(globalModeFile, 'utf8');
        expect(globalModeMarkdown).toContain('topLevelTab: chat');
        expect(globalModeMarkdown).toContain('modeKey: review');
        expect(globalModeMarkdown).toContain('whenToUse: "Use when a conversation needs a strict review pass."');
        expect(globalModeMarkdown).toContain('toolCapabilities:');
        expect(globalModeMarkdown).toContain('- filesystem_read');
        expect(globalModeMarkdown).toContain('- shell');
        expect(globalModeMarkdown).toContain('roleDefinition: "Act as a precise reviewer."');
        expect(globalModeMarkdown).toContain('Review the current conversation carefully.');

        const exportedGlobal = await caller.prompt.exportCustomMode({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'review',
            scope: 'global',
        });
        expect(JSON.parse(exportedGlobal.jsonText)).toEqual({
            slug: 'review',
            name: 'Portable Review',
            description: 'Global chat review mode',
            roleDefinition: 'Act as a precise reviewer.',
            customInstructions: 'Review the current conversation carefully.',
            whenToUse: 'Use when a conversation needs a strict review pass.',
            groups: ['read', 'command'],
        });

        const globalModes = await caller.mode.list({
            profileId,
            topLevelTab: 'chat',
        });
        expect(globalModes.modes.find((mode) => mode.modeKey === 'review')).toEqual(
            expect.objectContaining({
                whenToUse: 'Use when a conversation needs a strict review pass.',
                executionPolicy: {
                    toolCapabilities: ['filesystem_read', 'shell'],
                },
            })
        );

        await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Prompt portability workspace',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });
        const workspaceRegistry = await caller.registry.listResolved({
            profileId,
            workspaceFingerprint,
        });
        const workspaceAssetsRoot = workspaceRegistry.paths.workspaceAssetsRoot;
        if (!workspaceAssetsRoot) {
            throw new Error('Expected workspace assets root for prompt portability test.');
        }
        const workspaceModesRoot = path.join(workspaceAssetsRoot, 'modes');
        rmSync(workspaceModesRoot, { recursive: true, force: true });
        mkdirSync(workspaceModesRoot, { recursive: true });

        const importedWorkspace = await caller.prompt.importCustomMode({
            profileId,
            topLevelTab: 'orchestrator',
            scope: 'workspace',
            workspaceFingerprint,
            jsonText: JSON.stringify({
                slug: 'workspace-orchestrator',
                name: 'Workspace Orchestrator',
                customInstructions: 'Coordinate work from the workspace root first.',
                whenToUse: 'Use when the workspace needs multi-step coordination.',
                groups: ['edit'],
            }),
            overwrite: false,
        });
        expect(importedWorkspace.settings.fileBackedCustomModes.workspace?.orchestrator).toEqual([
            {
                topLevelTab: 'orchestrator',
                modeKey: 'workspace-orchestrator',
                label: 'Workspace Orchestrator',
                whenToUse: 'Use when the workspace needs multi-step coordination.',
                toolCapabilities: ['filesystem_read', 'filesystem_write'],
            },
        ]);
        expect(readFileSync(globalModeFile, 'utf8')).toBe(globalModeMarkdown);

        const workspaceModeFile = path.join(workspaceModesRoot, 'orchestrator-workspace-orchestrator.md');
        const workspaceModeMarkdown = readFileSync(workspaceModeFile, 'utf8');
        expect(workspaceModeMarkdown).toContain('topLevelTab: orchestrator');
        expect(workspaceModeMarkdown).toContain('whenToUse: "Use when the workspace needs multi-step coordination."');
        expect(workspaceModeMarkdown).toContain('Coordinate work from the workspace root first.');

        const workspaceModes = await caller.mode.list({
            profileId,
            topLevelTab: 'orchestrator',
            workspaceFingerprint,
        });
        expect(workspaceModes.modes.find((mode) => mode.modeKey === 'workspace-orchestrator')?.label).toBe(
            'Workspace Orchestrator'
        );
    });

    it('creates, edits, and deletes file-backed custom modes without mutating unrelated state', async () => {
        const caller = createCaller();
        const globalRegistry = await caller.registry.listResolved({ profileId });
        const globalModesRoot = path.join(globalRegistry.paths.globalAssetsRoot, 'modes');
        rmSync(globalModesRoot, { recursive: true, force: true });
        mkdirSync(globalModesRoot, { recursive: true });

        await caller.prompt.setBuiltInModePrompt({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'chat',
            roleDefinition: 'Built-in chat role override',
            customInstructions: 'Built-in chat custom override',
        });

        const created = await caller.prompt.createCustomMode({
            profileId,
            topLevelTab: 'chat',
            scope: 'global',
            mode: {
                slug: 'review',
                name: 'Review',
                description: 'Global review mode',
                roleDefinition: 'Act as a careful reviewer.',
                customInstructions: 'Review the conversation carefully.',
                whenToUse: 'Use when a conversation needs a careful review pass.',
                tags: ['quality', 'review'],
                toolCapabilities: ['filesystem_read', 'shell'],
            },
        });
        expect(created.settings.fileBackedCustomModes.global.chat).toEqual([
            {
                topLevelTab: 'chat',
                modeKey: 'review',
                label: 'Review',
                description: 'Global review mode',
                whenToUse: 'Use when a conversation needs a careful review pass.',
                tags: ['quality', 'review'],
                toolCapabilities: ['filesystem_read', 'shell'],
            },
        ]);
        expect(created.settings.builtInModes.chat.find((mode) => mode.modeKey === 'chat')?.prompt).toEqual({
            roleDefinition: 'Built-in chat role override',
            customInstructions: 'Built-in chat custom override',
        });

        const modeFile = path.join(globalModesRoot, 'chat-review.md');
        const initialMarkdown = readFileSync(modeFile, 'utf8');
        expect(initialMarkdown).toContain('label: "Review"');
        expect(initialMarkdown).toContain('tags:');
        expect(initialMarkdown).toContain('- "quality"');
        expect(initialMarkdown).toContain('toolCapabilities:');
        expect(initialMarkdown).toContain('- filesystem_read');
        expect(initialMarkdown).toContain('- shell');
        expect(initialMarkdown).not.toContain('groups:');

        const loaded = await caller.prompt.getCustomMode({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'review',
            scope: 'global',
        });
        expect(loaded.mode).toEqual({
            scope: 'global',
            topLevelTab: 'chat',
            modeKey: 'review',
            slug: 'review',
            name: 'Review',
            description: 'Global review mode',
            roleDefinition: 'Act as a careful reviewer.',
            customInstructions: 'Review the conversation carefully.',
            whenToUse: 'Use when a conversation needs a careful review pass.',
            tags: ['quality', 'review'],
            toolCapabilities: ['filesystem_read', 'shell'],
        });

        await expect(
            caller.prompt.createCustomMode({
                profileId,
                topLevelTab: 'chat',
                scope: 'global',
                mode: {
                    slug: 'review',
                    name: 'Duplicate Review',
                },
            })
        ).rejects.toThrow('already exists');
        expect(readFileSync(modeFile, 'utf8')).toBe(initialMarkdown);

        const updated = await caller.prompt.updateCustomMode({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'review',
            scope: 'global',
            mode: {
                name: 'Review Updated',
                description: 'Updated global review mode',
                roleDefinition: 'Act as a stricter reviewer.',
                customInstructions: 'Review the conversation with stricter criteria.',
                whenToUse: 'Use when a conversation needs a stricter review pass.',
                tags: ['quality', 'strict'],
                toolCapabilities: ['filesystem_read'],
            },
        });
        expect(updated.settings.fileBackedCustomModes.global.chat).toEqual([
            {
                topLevelTab: 'chat',
                modeKey: 'review',
                label: 'Review Updated',
                description: 'Updated global review mode',
                whenToUse: 'Use when a conversation needs a stricter review pass.',
                tags: ['quality', 'strict'],
                toolCapabilities: ['filesystem_read'],
            },
        ]);
        const updatedMarkdown = readFileSync(modeFile, 'utf8');
        expect(updatedMarkdown).toContain('label: "Review Updated"');
        expect(updatedMarkdown).toContain('whenToUse: "Use when a conversation needs a stricter review pass."');

        const activated = await caller.mode.setActive({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'review',
        });
        expect(activated.updated).toBe(true);

        await expect(
            caller.prompt.deleteCustomMode({
                profileId,
                topLevelTab: 'chat',
                modeKey: 'review',
                scope: 'global',
                confirm: false,
            })
        ).rejects.toThrow('explicit confirmation');
        expect(readFileSync(modeFile, 'utf8')).toBe(updatedMarkdown);

        const deleted = await caller.prompt.deleteCustomMode({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'review',
            scope: 'global',
            confirm: true,
        });
        expect(deleted.settings.fileBackedCustomModes.global.chat).toEqual([]);
        expect(() => readFileSync(modeFile, 'utf8')).toThrow();

        const activeAfterDelete = await caller.mode.getActive({
            profileId,
            topLevelTab: 'chat',
        });
        expect(activeAfterDelete.activeMode.modeKey).toBe('chat');
        expect(activeAfterDelete.activeMode.label).toBe('Chat');
        expect(activeAfterDelete.activeMode.prompt).toEqual({
            roleDefinition: 'Built-in chat role override',
            customInstructions: 'Built-in chat custom override',
        });
    });

    it('creates workspace file-backed custom modes in the workspace registry root', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_prompt_custom_mode_crud';

        await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Prompt mode workspace crud',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const workspaceRegistry = await caller.registry.listResolved({
            profileId,
            workspaceFingerprint,
        });
        const workspaceAssetsRoot = workspaceRegistry.paths.workspaceAssetsRoot;
        if (!workspaceAssetsRoot) {
            throw new Error('Expected workspace assets root for custom mode workspace test.');
        }
        const workspaceModesRoot = path.join(workspaceAssetsRoot, 'modes');
        rmSync(workspaceModesRoot, { recursive: true, force: true });
        mkdirSync(workspaceModesRoot, { recursive: true });

        const created = await caller.prompt.createCustomMode({
            profileId,
            topLevelTab: 'agent',
            scope: 'workspace',
            workspaceFingerprint,
            mode: {
                slug: 'workspace-review',
                name: 'Workspace Review',
                customInstructions: 'Review the active workspace first.',
            },
        });
        expect(created.settings.fileBackedCustomModes.workspace?.agent).toEqual([
            {
                topLevelTab: 'agent',
                modeKey: 'workspace-review',
                label: 'Workspace Review',
            },
        ]);

        const workspaceModeFile = path.join(workspaceModesRoot, 'agent-workspace-review.md');
        expect(readFileSync(workspaceModeFile, 'utf8')).toContain('Review the active workspace first.');
    });

    it('fails closed on unsupported fields and overwrite without explicit confirmation', async () => {
        const caller = createCaller();
        const globalRegistry = await caller.registry.listResolved({ profileId });
        const globalModesRoot = path.join(globalRegistry.paths.globalAssetsRoot, 'modes');
        rmSync(globalModesRoot, { recursive: true, force: true });
        mkdirSync(globalModesRoot, { recursive: true });
        const existingModeFile = path.join(globalModesRoot, 'chat-review.md');

        await caller.prompt.importCustomMode({
            profileId,
            topLevelTab: 'chat',
            scope: 'global',
            jsonText: JSON.stringify({
                slug: 'review',
                name: 'Original Review',
                customInstructions: 'Original instructions.',
            }),
            overwrite: false,
        });
        const initialMarkdown = readFileSync(existingModeFile, 'utf8');

        await expect(
            caller.prompt.importCustomMode({
                profileId,
                topLevelTab: 'chat',
                scope: 'global',
                jsonText: JSON.stringify({
                    slug: 'review',
                    name: 'Replacement Review',
                    customInstructions: 'Replacement instructions.',
                }),
                overwrite: false,
            })
        ).rejects.toThrow('overwrite confirmation');
        expect(readFileSync(existingModeFile, 'utf8')).toBe(initialMarkdown);

        await expect(
            caller.prompt.importCustomMode({
                profileId,
                topLevelTab: 'chat',
                scope: 'global',
                jsonText: JSON.stringify({
                    slug: 'invalid-mode',
                    name: 'Invalid Mode',
                    groups: ['read', 42],
                }),
                overwrite: false,
            })
        ).rejects.toThrow('Invalid "groups": expected string array.');

        await expect(
            caller.prompt.importCustomMode({
                profileId,
                topLevelTab: 'chat',
                scope: 'global',
                jsonText: JSON.stringify({
                    slug: 'invalid-mode',
                    name: 'Invalid Mode',
                    groups: [['edit', { fileRegex: 'src/.*' }]],
                }),
                overwrite: false,
            })
        ).rejects.toThrow('restricted tuple forms');

        await expect(
            caller.prompt.importCustomMode({
                profileId,
                topLevelTab: 'chat',
                scope: 'global',
                jsonText: JSON.stringify({
                    slug: 'invalid-mode',
                    name: 'Invalid Mode',
                    groups: ['browser'],
                }),
                overwrite: false,
            })
        ).rejects.toThrow('Unsupported portable tool group "browser"');

        await expect(
            caller.prompt.importCustomMode({
                profileId,
                topLevelTab: 'chat',
                scope: 'global',
                jsonText: JSON.stringify({
                    slug: 'invalid-mode',
                    name: 'Invalid Mode',
                    unknownField: 'still fail closed',
                }),
                overwrite: false,
            })
        ).rejects.toThrow('Invalid custom mode field "unknownField"');

        expect(readFileSync(existingModeFile, 'utf8')).toBe(initialMarkdown);
    });

    it('fails closed when portable export cannot faithfully represent internal tool capabilities', async () => {
        const caller = createCaller();
        const globalRegistry = await caller.registry.listResolved({ profileId });
        const globalModesRoot = path.join(globalRegistry.paths.globalAssetsRoot, 'modes');
        rmSync(globalModesRoot, { recursive: true, force: true });
        mkdirSync(globalModesRoot, { recursive: true });

        await caller.prompt.createCustomMode({
            profileId,
            topLevelTab: 'agent',
            scope: 'global',
            mode: {
                slug: 'git-review',
                name: 'Git Review',
                customInstructions: 'Inspect repository history before reviewing.',
                toolCapabilities: ['git'],
            },
        });

        await expect(
            caller.prompt.exportCustomMode({
                profileId,
                topLevelTab: 'agent',
                modeKey: 'git-review',
                scope: 'global',
            })
        ).rejects.toThrow('Portable export does not support the "git" tool capability');
        expect(readFileSync(path.join(globalModesRoot, 'agent-git-review.md'), 'utf8')).toContain('- git');
    });

    it('exports a legacy markdown-only custom mode as the supported portable subset without mutation', async () => {
        const caller = createCaller();
        const globalRegistry = await caller.registry.listResolved({ profileId });
        const globalModesRoot = path.join(globalRegistry.paths.globalAssetsRoot, 'modes');
        rmSync(globalModesRoot, { recursive: true, force: true });
        mkdirSync(globalModesRoot, { recursive: true });
        const legacyModeFile = path.join(globalModesRoot, 'agent-legacy-review.md');

        writeFileSync(
            legacyModeFile,
            `---
topLevelTab: agent
modeKey: legacy-review
label: Legacy Review
description: Legacy markdown-only review mode
---
# Legacy Review

- Review the repository with the legacy markdown prompt only.
`,
            'utf8'
        );

        await caller.registry.refresh({ profileId });
        const beforeExport = readFileSync(legacyModeFile, 'utf8');

        const exported = await caller.prompt.exportCustomMode({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'legacy-review',
            scope: 'global',
        });

        expect(JSON.parse(exported.jsonText)).toEqual({
            slug: 'legacy-review',
            name: 'Legacy Review',
            description: 'Legacy markdown-only review mode',
            customInstructions: '# Legacy Review\n\n- Review the repository with the legacy markdown prompt only.',
        });
        expect(readFileSync(legacyModeFile, 'utf8')).toBe(beforeExport);
    });
});
