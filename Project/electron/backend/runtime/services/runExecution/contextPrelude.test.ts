import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, getPersistence, resetPersistenceForTests } from '@/app/backend/persistence/db';
import {
    builtInModePromptOverrideStore,
    conversationStore,
    sandboxStore,
    sessionAttachedRuleStore,
    sessionAttachedSkillStore,
    sessionStore,
    settingsStore,
    threadStore,
    workspaceRootStore,
} from '@/app/backend/persistence/stores';
import { appPromptLayerSettingsStore } from '@/app/backend/persistence/stores/runtime/appPromptLayerSettingsStore';
import { resolveActiveMode } from '@/app/backend/runtime/services/mode/activeMode';
import { buildSessionSystemPrelude } from '@/app/backend/runtime/services/runExecution/contextPrelude';
import { VENDORED_NODE_VERSION } from '@/shared/tooling/vendoredNode';

describe('buildSessionSystemPrelude', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('includes the concrete workspace path for agent sessions', async () => {
        const profileId = getDefaultProfileId();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'nc-workspace-prelude-'));
        mkdirSync(path.join(workspacePath, '.jj'));
        const workspaceRoot = await workspaceRootStore.resolveOrCreate(profileId, workspacePath);
        const bucket = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: workspaceRoot.fingerprint,
            title: 'Workspace Prelude',
        });
        if (bucket.isErr()) {
            throw new Error(bucket.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: bucket.value.id,
            title: 'Agent Thread',
            topLevelTab: 'agent',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }

        const result = await buildSessionSystemPrelude({
            profileId,
            sessionId: session.session.id,
            prompt: 'Inspect the workspace setup.',
            topLevelTab: 'agent',
            workspaceFingerprint: workspaceRoot.fingerprint,
            resolvedMode: {
                mode: {
                    id: 'mode_profile_local_default_agent_code',
                    profileId,
                    topLevelTab: 'agent',
                    modeKey: 'code',
                    label: 'Agent Code',
                    prompt: {},
                    executionPolicy: {},
                    source: 'system',
                    enabled: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    assetKey: 'code',
                    sourceKind: 'system_seed',
                    scope: 'system',
                    tags: [],
                    precedence: 0,
                },
            },
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value[0]?.role).toBe('system');
        const firstTextPart = result.value[0]?.parts[0];
        expect(firstTextPart?.type).toBe('text');
        if (!firstTextPart || firstTextPart.type !== 'text') {
            throw new Error('Expected workspace prelude text part.');
        }

        expect(firstTextPart.text).toContain(workspaceRoot.absolutePath);
        expect(firstTextPart.text).toContain('"/workspace"');
        const environmentGuidancePart = result.value[1]?.parts[0];
        expect(environmentGuidancePart?.type).toBe('text');
        if (!environmentGuidancePart || environmentGuidancePart.type !== 'text') {
            throw new Error('Expected environment guidance text part.');
        }
        expect(environmentGuidancePart.text).toContain('Preferred VCS: jj');
        expect(environmentGuidancePart.text).toContain(
            process.platform === 'win32' ? 'PowerShell' : '/bin/sh-style shell'
        );
        expect(environmentGuidancePart.text).toContain(`Vendored code runtime: Node v${VENDORED_NODE_VERSION}.`);
    });

    it('assembles prompt layers in the documented order for chat sessions', async () => {
        const profileId = getDefaultProfileId();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'nc-prompt-order-'));
        const workspaceRoot = await workspaceRootStore.resolveOrCreate(profileId, workspacePath);
        const bucket = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: workspaceRoot.fingerprint,
            title: 'Prompt Order',
        });
        if (bucket.isErr()) {
            throw new Error(bucket.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: bucket.value.id,
            title: 'Chat Thread',
            topLevelTab: 'chat',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }

        await Promise.all([
            appPromptLayerSettingsStore.setGlobalInstructions('App layer'),
            settingsStore.setString(profileId, 'prompt_layer.profile_global_instructions', 'Profile layer'),
            settingsStore.setString(profileId, 'prompt_layer.top_level.chat', 'Chat layer'),
            builtInModePromptOverrideStore.setPrompt({
                profileId,
                topLevelTab: 'chat',
                modeKey: 'chat',
                prompt: {
                    roleDefinition: 'Role layer',
                    customInstructions: 'Mode layer',
                },
            }),
        ]);

        writeFileSync(
            path.join(workspaceRoot.absolutePath, 'AGENTS.md'),
            `---
ignored: true
---
# Workspace Agents

Primary project instructions.
`,
            'utf8'
        );
        writeFileSync(
            path.join(workspaceRoot.absolutePath, '.agents-note.txt'),
            'not markdown and should not load',
            'utf8'
        );
        const modularAgentsDirectory = path.join(workspaceRoot.absolutePath, '.agents', 'nested');
        mkdirSync(modularAgentsDirectory, { recursive: true });
        writeFileSync(
            path.join(workspaceRoot.absolutePath, '.agents', 'z-last.md'),
            '# Z Last\n\nLoad after nested instructions.',
            'utf8'
        );
        writeFileSync(
            path.join(modularAgentsDirectory, 'a-first.md'),
            `---
ignored: true
---
# A First

Nested project instructions.
`,
            'utf8'
        );

        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        sqlite
            .prepare(
                `
                    INSERT INTO rulesets (
                        id, profile_id, asset_key, scope, workspace_fingerprint, name, body_markdown, source,
                        source_kind, activation_mode, enabled, precedence, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_shared_rule',
                profileId,
                'shared_rule',
                'global',
                null,
                'Shared Rule',
                '# Shared Rule',
                'test',
                'system_seed',
                'manual',
                1,
                0,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO skillfiles (
                        id, profile_id, asset_key, scope, workspace_fingerprint, name, body_markdown, source,
                        source_kind, enabled, precedence, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'skillfile_attached_skill',
                profileId,
                'attached_skill',
                'global',
                null,
                'Attached Skill',
                '# Attached Skill',
                'test',
                'system_seed',
                1,
                0,
                now,
                now
            );

        const attachedRule = await sessionAttachedRuleStore.replaceForSession({
            profileId,
            sessionId: session.session.id,
            assetKeys: ['shared_rule'],
        });
        const attachedSkill = await sessionAttachedSkillStore.replaceForSession({
            profileId,
            sessionId: session.session.id,
            assetKeys: ['attached_skill'],
        });
        expect(attachedRule.length).toBe(1);
        expect(attachedSkill.length).toBe(1);

        const activeModeResult = await resolveActiveMode({
            profileId,
            topLevelTab: 'chat',
            workspaceFingerprint: workspaceRoot.fingerprint,
        });
        expect(activeModeResult.isOk()).toBe(true);
        if (activeModeResult.isErr()) {
            throw new Error(activeModeResult.error.message);
        }

        const result = await buildSessionSystemPrelude({
            profileId,
            sessionId: session.session.id,
            prompt: 'Need prompt ordering',
            topLevelTab: 'chat',
            workspaceFingerprint: workspaceRoot.fingerprint,
            resolvedMode: {
                mode: activeModeResult.value.activeMode,
            },
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        const messageTexts = result.value.flatMap((message) =>
            message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
        );
        expect(messageTexts.map((message) => message.split('\n\n')[0])).toEqual([
            'Execution environment',
            'Environment guidance',
            'App instructions',
            'Profile instructions',
            'Built-in chat instructions',
            'Active mode role: Chat',
            'Active mode instructions: Chat',
            'Ruleset: Shared Rule',
            'Project instructions: AGENTS.md',
            'Project instructions: .agents/nested/a-first.md',
            'Project instructions: .agents/z-last.md',
            'Attached skill: Attached Skill',
        ]);
    });

    it('reads project instructions from the effective sandbox root instead of the base workspace root', async () => {
        const profileId = getDefaultProfileId();
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'nc-agents-sandbox-root-'));
        const workspaceRoot = await workspaceRootStore.resolveOrCreate(profileId, workspacePath);
        const bucket = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: workspaceRoot.fingerprint,
            title: 'Sandbox Prompt Root',
        });
        if (bucket.isErr()) {
            throw new Error(bucket.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: bucket.value.id,
            title: 'Sandbox Agent Thread',
            topLevelTab: 'agent',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }

        const sandboxPath = path.join(workspaceRoot.absolutePath, '.sandboxes', 'agents-root');
        mkdirSync(sandboxPath, { recursive: true });
        writeFileSync(
            path.join(workspaceRoot.absolutePath, 'AGENTS.md'),
            '# Base Workspace\n\nBase instructions.',
            'utf8'
        );
        writeFileSync(path.join(sandboxPath, 'AGENTS.md'), '# Sandbox Root\n\nSandbox instructions.', 'utf8');

        const sandbox = await sandboxStore.create({
            profileId,
            workspaceFingerprint: workspaceRoot.fingerprint,
            absolutePath: sandboxPath,
            label: 'agents-root-sandbox',
            status: 'ready',
            creationStrategy: 'copy',
        });
        const boundThread = await threadStore.bindSandbox({
            profileId,
            threadId: thread.value.id,
            sandboxId: sandbox.id,
        });
        if (!boundThread) {
            throw new Error('Expected thread sandbox binding to succeed.');
        }

        const session = await sessionStore.create(profileId, thread.value.id, 'sandbox');
        if (!session.created) {
            throw new Error(`Expected sandbox session creation to succeed, received "${session.reason}".`);
        }
        await sessionStore.setSandboxBinding({
            profileId,
            sessionId: session.session.id,
            sandboxId: sandbox.id,
        });

        const result = await buildSessionSystemPrelude({
            profileId,
            sessionId: session.session.id,
            prompt: 'Use the sandbox instructions.',
            topLevelTab: 'agent',
            workspaceFingerprint: workspaceRoot.fingerprint,
            resolvedMode: {
                mode: {
                    id: 'mode_profile_local_default_agent_code',
                    profileId,
                    topLevelTab: 'agent',
                    modeKey: 'code',
                    label: 'Agent Code',
                    prompt: {},
                    executionPolicy: {},
                    source: 'system',
                    enabled: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    assetKey: 'code',
                    sourceKind: 'system_seed',
                    scope: 'system',
                    tags: [],
                    precedence: 0,
                },
            },
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        const projectInstructionTexts = result.value.flatMap((message) =>
            message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
        );
        expect(
            projectInstructionTexts.some(
                (text) => text.includes('Project instructions: AGENTS.md') && text.includes('Sandbox Root')
            )
        ).toBe(true);
        expect(
            projectInstructionTexts.some(
                (text) => text.includes('Project instructions: AGENTS.md') && text.includes('Base Workspace')
            )
        ).toBe(false);
    });
});
