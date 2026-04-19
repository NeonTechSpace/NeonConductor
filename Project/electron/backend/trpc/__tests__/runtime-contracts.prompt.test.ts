import { describe, expect, it } from 'vitest';

import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';
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

    it('returns canonical built-in prompt settings and seeded mode metadata', async () => {
        const caller = createCaller();

        const initialSettings = await caller.prompt.getSettings({ profileId });
        expect(initialSettings.settings.appGlobalInstructions).toBe('');
        expect(initialSettings.settings.profileGlobalInstructions).toBe('');
        expect(initialSettings.settings.topLevelInstructions).toEqual({
            chat: '',
            agent: '',
            orchestrator: '',
        });
        expect(initialSettings.settings.preparedContextProfileDefaults).toEqual({
            app_global_instructions: {
                bootstrap: 'include',
                post_compaction_reseed: 'include',
            },
            profile_global_instructions: {
                bootstrap: 'include',
                post_compaction_reseed: 'include',
            },
            top_level_instructions: {
                bootstrap: 'include',
                post_compaction_reseed: 'include',
            },
        });
        expect(initialSettings.settings.modeDrafts).toEqual([]);
        expect(initialSettings.settings.delegatedWorkerModes.global).toEqual([]);
        expect(initialSettings.settings.builtInModes.chat).toEqual([
            expect.objectContaining({
                topLevelTab: 'chat',
                modeKey: 'chat',
                label: 'Chat',
                prompt: {},
                hasOverride: false,
                authoringRole: 'chat',
                roleTemplate: 'chat/default',
                internalModelRole: 'chat',
                promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
                runtimeProfile: 'general',
                toolCapabilities: [],
            }),
        ]);
        expect(initialSettings.settings.builtInModes.agent.find((mode) => mode.modeKey === 'code')).toMatchObject({
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/apply',
            internalModelRole: 'apply',
            runtimeProfile: 'mutating_agent',
        });

        const seededModes = await caller.mode.list({
            profileId,
            topLevelTab: 'agent',
        });
        expect(seededModes.modes.find((mode) => mode.modeKey === 'plan')).toMatchObject({
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/plan',
            internalModelRole: 'planner',
            promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
            delegatedOnly: false,
            sessionSelectable: true,
                executionPolicy: {
                    authoringRole: 'single_task_agent',
                    roleTemplate: 'single_task_agent/plan',
                    internalModelRole: 'planner',
                    delegatedOnly: false,
                    sessionSelectable: true,
                    toolCapabilities: ['filesystem_read', 'mcp'],
                    workflowCapabilities: ['planning', 'artifact_view', 'recovery'],
                    behaviorFlags: ['approval_gated', 'artifact_producing', 'read_only_execution'],
                    runtimeProfile: 'planner',
                },
        });
    });

    it('persists prepared-context profile defaults and prompt-layer overrides through prompt settings', async () => {
        const caller = createCaller();

        const updatedDefaults = await caller.prompt.setPreparedContextProfileDefaults({
            profileId,
            defaults: {
                app_global_instructions: {
                    bootstrap: 'include',
                    post_compaction_reseed: 'exclude',
                },
                profile_global_instructions: {
                    bootstrap: 'exclude',
                    post_compaction_reseed: 'exclude',
                },
                top_level_instructions: {
                    bootstrap: 'include',
                    post_compaction_reseed: 'include',
                },
            },
        });
        expect(updatedDefaults.settings.preparedContextProfileDefaults.profile_global_instructions.bootstrap).toBe(
            'exclude'
        );

        const builtInUpdated = await caller.prompt.setBuiltInModePrompt({
            profileId,
            topLevelTab: 'chat',
            modeKey: 'chat',
            roleDefinition: 'Chat role override',
            customInstructions: 'Chat custom override',
            promptLayerOverrides: {
                app_global_instructions: {
                    bootstrap: 'inherit',
                    post_compaction_reseed: 'exclude',
                },
                profile_global_instructions: {
                    bootstrap: 'include',
                    post_compaction_reseed: 'inherit',
                },
                top_level_instructions: {
                    bootstrap: 'inherit',
                    post_compaction_reseed: 'include',
                },
            },
        });
        expect(builtInUpdated.settings.builtInModes.chat[0]).toMatchObject({
            hasOverride: true,
            promptLayerOverrides: {
                profile_global_instructions: {
                    bootstrap: 'include',
                    post_compaction_reseed: 'inherit',
                },
            },
        });

        const resetDefaults = await caller.prompt.resetPreparedContextProfileDefaults({ profileId });
        expect(resetDefaults.settings.preparedContextProfileDefaults).toEqual({
            app_global_instructions: {
                bootstrap: 'include',
                post_compaction_reseed: 'include',
            },
            profile_global_instructions: {
                bootstrap: 'include',
                post_compaction_reseed: 'include',
            },
            top_level_instructions: {
                bootstrap: 'include',
                post_compaction_reseed: 'include',
            },
        });
    });

    it('creates, updates, exports, and deletes canonical file-backed custom modes', async () => {
        const caller = createCaller();
        const globalRegistry = await caller.registry.listResolved({ profileId });
        const globalModesRoot = path.join(globalRegistry.paths.globalAssetsRoot, 'modes');
        rmSync(globalModesRoot, { recursive: true, force: true });
        mkdirSync(globalModesRoot, { recursive: true });

        const created = await caller.prompt.createCustomMode({
            profileId,
            topLevelTab: 'agent',
            scope: 'global',
            mode: {
                slug: 'workflow-review',
                name: 'Workflow Review',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                description: 'Workflow-aware review mode',
                roleDefinition: 'Act as a workflow review specialist.',
                customInstructions: 'Review workflow boundaries carefully.',
                whenToUse: 'Use when the plan needs a recovery-aware review.',
                tags: ['workflow', 'review'],
            },
        });

        expect(created.settings.fileBackedCustomModes.global.agent).toEqual([
            {
                topLevelTab: 'agent',
                modeKey: 'workflow-review',
                label: 'Workflow Review',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                internalModelRole: 'apply',
                delegatedOnly: false,
                sessionSelectable: true,
                description: 'Workflow-aware review mode',
                whenToUse: 'Use when the plan needs a recovery-aware review.',
                tags: ['workflow', 'review'],
                promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
                toolCapabilities: ['filesystem_read', 'mcp'],
                workflowCapabilities: ['review', 'artifact_view'],
                behaviorFlags: ['read_only_execution', 'artifact_producing'],
                runtimeProfile: 'reviewer',
            },
        ]);

        const loaded = await caller.prompt.getCustomMode({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'workflow-review',
            scope: 'global',
        });
        expect(loaded.mode).toEqual({
            scope: 'global',
            topLevelTab: 'agent',
            modeKey: 'workflow-review',
            slug: 'workflow-review',
            name: 'Workflow Review',
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/review',
            internalModelRole: 'apply',
            delegatedOnly: false,
            sessionSelectable: true,
            description: 'Workflow-aware review mode',
            roleDefinition: 'Act as a workflow review specialist.',
            customInstructions: 'Review workflow boundaries carefully.',
            whenToUse: 'Use when the plan needs a recovery-aware review.',
            tags: ['workflow', 'review'],
            promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
            toolCapabilities: ['filesystem_read', 'mcp'],
            workflowCapabilities: ['review', 'artifact_view'],
            behaviorFlags: ['read_only_execution', 'artifact_producing'],
            runtimeProfile: 'reviewer',
        });

        const modeFile = path.join(globalModesRoot, 'agent-workflow-review.md');
        const modeMarkdown = readFileSync(modeFile, 'utf8');
        expect(modeMarkdown).toContain('authoringRole: single_task_agent');
        expect(modeMarkdown).toContain('roleTemplate: single_task_agent/review');
        expect(modeMarkdown).not.toContain('toolCapabilities:');

        const exported = await caller.prompt.exportCustomMode({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'workflow-review',
            scope: 'global',
        });
        expect(JSON.parse(exported.jsonText)).toEqual({
            version: 2,
            slug: 'workflow-review',
            name: 'Workflow Review',
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/review',
            description: 'Workflow-aware review mode',
            roleDefinition: 'Act as a workflow review specialist.',
            customInstructions: 'Review workflow boundaries carefully.',
            whenToUse: 'Use when the plan needs a recovery-aware review.',
            tags: ['workflow', 'review'],
        });

        const updated = await caller.prompt.updateCustomMode({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'workflow-review',
            scope: 'global',
            mode: {
                name: 'Workflow Review Updated',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                description: 'Updated review mode',
                customInstructions: 'Review with stricter criteria.',
                whenToUse: 'Use when the plan needs a stricter review.',
                tags: ['workflow', 'strict'],
            },
        });
        expect(updated.settings.fileBackedCustomModes.global.agent[0]).toMatchObject({
            label: 'Workflow Review Updated',
            description: 'Updated review mode',
            whenToUse: 'Use when the plan needs a stricter review.',
            tags: ['workflow', 'strict'],
        });

        await expect(
            caller.prompt.deleteCustomMode({
                profileId,
                topLevelTab: 'agent',
                modeKey: 'workflow-review',
                scope: 'global',
                confirm: false,
            })
        ).rejects.toThrow('explicit confirmation');

        const deleted = await caller.prompt.deleteCustomMode({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'workflow-review',
            scope: 'global',
            confirm: true,
        });
        expect(deleted.settings.fileBackedCustomModes.global.agent).toEqual([]);
        expect(() => readFileSync(modeFile, 'utf8')).toThrow();
    });

    it('supports draft lifecycle, apply, overwrite protection, and portable import', async () => {
        const caller = createCaller();
        const globalRegistry = await caller.registry.listResolved({ profileId });
        const globalModesRoot = path.join(globalRegistry.paths.globalAssetsRoot, 'modes');
        rmSync(globalModesRoot, { recursive: true, force: true });
        mkdirSync(globalModesRoot, { recursive: true });

        const createdDraft = await caller.prompt.createModeDraft({
            profileId,
            scope: 'global',
            sourceKind: 'manual',
            mode: {
                slug: 'review',
                name: 'Review',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                customInstructions: 'Review carefully.',
            },
        });
        expect(createdDraft.draft).toMatchObject({
            scope: 'global',
            sourceKind: 'manual',
            validationState: 'valid',
            mode: {
                slug: 'review',
                name: 'Review',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
            },
        });

        const validatedDraft = await caller.prompt.validateModeDraft({
            profileId,
            draftId: createdDraft.draft.id,
        });
        expect(validatedDraft.draft.validationState).toBe('valid');

        const appliedDraft = await caller.prompt.applyModeDraft({
            profileId,
            draftId: createdDraft.draft.id,
            overwrite: false,
        });
        expect(appliedDraft.settings.modeDrafts).toEqual([]);
        expect(appliedDraft.settings.fileBackedCustomModes.global.agent).toEqual([
            {
                topLevelTab: 'agent',
                modeKey: 'review',
                label: 'Review',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                internalModelRole: 'apply',
                delegatedOnly: false,
                sessionSelectable: true,
                promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
                toolCapabilities: ['filesystem_read', 'mcp'],
                workflowCapabilities: ['review', 'artifact_view'],
                behaviorFlags: ['read_only_execution', 'artifact_producing'],
                runtimeProfile: 'reviewer',
            },
        ]);
        expect(readFileSync(path.join(globalModesRoot, 'agent-review.md'), 'utf8')).toContain(
            'roleTemplate: single_task_agent/review'
        );

        const conflictingDraft = await caller.prompt.createModeDraft({
            profileId,
            scope: 'global',
            sourceKind: 'portable_json_v2',
            sourceText: '{"version":2}',
            mode: {
                slug: 'review',
                name: 'Review Replacement',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                customInstructions: 'Replacement instructions.',
            },
        });
        await expect(
            caller.prompt.applyModeDraft({
                profileId,
                draftId: conflictingDraft.draft.id,
                overwrite: false,
            })
        ).rejects.toThrow('overwrite confirmation');

        const overwrittenDraft = await caller.prompt.applyModeDraft({
            profileId,
            draftId: conflictingDraft.draft.id,
            overwrite: true,
        });
        expect(overwrittenDraft.settings.fileBackedCustomModes.global.agent[0]).toMatchObject({
            label: 'Review Replacement',
        });

        const importedV2 = await caller.prompt.importCustomMode({
            profileId,
            scope: 'global',
            jsonText: JSON.stringify({
                version: 2,
                slug: 'debug-review',
                name: 'Debug Review',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/debug',
                customInstructions: 'Debug carefully.',
            }),
            topLevelTab: 'agent',
        });
        expect(importedV2.draft).toMatchObject({
            sourceKind: 'portable_json_v2',
            validationState: 'valid',
            mode: {
                slug: 'debug-review',
                roleTemplate: 'single_task_agent/debug',
            },
        });

        const importedV1 = await caller.prompt.importCustomMode({
            profileId,
            scope: 'global',
            topLevelTab: 'agent',
            jsonText: JSON.stringify({
                slug: 'legacy-ask',
                name: 'Legacy Ask',
                customInstructions: 'Legacy instructions.',
                groups: ['read'],
            }),
        });
        expect(importedV1.draft).toMatchObject({
            sourceKind: 'portable_json_v1',
            validationState: 'valid',
            mode: {
                slug: 'legacy-ask',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/ask',
            },
        });
    });

    it('keeps exports fail-closed for legacy markdown-only modes and draft import isolated from live registry', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'wsf_prompt_mode_legacy';

        await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Prompt mode workspace',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const workspaceRegistry = await caller.registry.listResolved({
            profileId,
            workspaceFingerprint,
        });
        const workspaceAssetsRoot = workspaceRegistry.paths.workspaceAssetsRoot;
        if (!workspaceAssetsRoot) {
            throw new Error('Expected workspace assets root.');
        }

        const workspaceModesRoot = path.join(workspaceAssetsRoot, 'modes');
        rmSync(workspaceModesRoot, { recursive: true, force: true });
        mkdirSync(workspaceModesRoot, { recursive: true });

        const legacyModeFile = path.join(workspaceModesRoot, 'agent-legacy-review.md');
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

        await caller.registry.refresh({ profileId, workspaceFingerprint });
        const exported = await caller.prompt.exportCustomMode({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'legacy-review',
            scope: 'workspace',
            workspaceFingerprint,
        });
        expect(JSON.parse(exported.jsonText)).toEqual({
            version: 2,
            slug: 'legacy-review',
            name: 'Legacy Review',
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/apply',
            description: 'Legacy markdown-only review mode',
            customInstructions: '# Legacy Review\n\n- Review the repository with the legacy markdown prompt only.',
        });

        const importedDraft = await caller.prompt.importCustomMode({
            profileId,
            scope: 'workspace',
            workspaceFingerprint,
            topLevelTab: 'orchestrator',
            jsonText: JSON.stringify({
                slug: 'workspace-orchestrator',
                name: 'Workspace Orchestrator',
                customInstructions: 'Coordinate from the workspace root first.',
                groups: ['edit'],
            }),
        });
        expect(importedDraft.settings.fileBackedCustomModes.workspace?.orchestrator).toEqual([]);
        expect(importedDraft.draft.scope).toBe('workspace');
        expect(readFileSync(legacyModeFile, 'utf8')).toContain('Legacy Review');
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
        expect(settings.settings.builtInModes.agent.find((mode) => mode.modeKey === 'code')).toMatchObject({
            topLevelTab: 'agent',
            modeKey: 'code',
            label: 'Agent Code',
            prompt: {},
            hasOverride: true,
            roleTemplate: 'single_task_agent/apply',
        });
    });
});
