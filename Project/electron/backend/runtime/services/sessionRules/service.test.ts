import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
    getDefaultProfileId,
    resetPersistenceForTests,
} from '@/app/backend/persistence/db';
import { conversationStore, sessionStore, threadStore, workspaceRootStore } from '@/app/backend/persistence/stores';
import { refreshRegistry } from '@/app/backend/runtime/services/registry/service';
import { setAttachedRules } from '@/app/backend/runtime/services/sessionRules/service';

describe('sessionRules service', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    async function createWorkspaceSession(profileId: string) {
        const workspaceRoot = await workspaceRootStore.resolveOrCreate(
            profileId,
            'M:\\Libraries\\Downloads\\session-rules'
        );
        const bucket = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: workspaceRoot.fingerprint,
            title: 'Session Rules Workspace',
        });
        if (bucket.isErr()) {
            throw new Error(bucket.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: bucket.value.id,
            title: 'Session Rules Thread',
            topLevelTab: 'agent',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }

        return session.session.id;
    }

    it('accepts manual rules and rejects non-manual rule attachments', async () => {
        const profileId = getDefaultProfileId();
        const sessionId = await createWorkspaceSession(profileId);
        const nativeGlobalRoot = path.join(os.homedir(), '.neonconductor');

        mkdirSync(path.join(nativeGlobalRoot, 'rules', 'presets', 'code'), { recursive: true });
        writeFileSync(
            path.join(nativeGlobalRoot, 'rules', 'presets', 'code', 'phase5-session-rules-manual-rule.md'),
            `---
key: phase5_session_rules_manual_rule
name: Manual Rule
activationMode: manual
description: Attach this rule explicitly for code sessions.
---
# Manual Rule

- Apply this rule only when attached manually.
`,
            'utf8'
        );
        writeFileSync(
            path.join(nativeGlobalRoot, 'rules', 'presets', 'code', 'phase5-session-rules-always-rule.md'),
            `---
key: phase5_session_rules_always_rule
name: Always Rule
activationMode: always
description: This rule should never be attached manually.
---
# Always Rule

- Apply this rule automatically.
`,
            'utf8'
        );

        await refreshRegistry({ profileId });

        const attachedManualRule = await setAttachedRules({
            profileId,
            sessionId,
            topLevelTab: 'agent',
            modeKey: 'code',
            assetKeys: ['phase5_session_rules_manual_rule'],
        });
        expect(attachedManualRule.isOk()).toBe(true);
        if (attachedManualRule.isErr()) {
            throw new Error(attachedManualRule.error.message);
        }
        expect(attachedManualRule.value.rulesets.map((ruleset) => ruleset.assetKey)).toEqual([
            'phase5_session_rules_manual_rule',
        ]);

        const attachedAlwaysRule = await setAttachedRules({
            profileId,
            sessionId,
            topLevelTab: 'agent',
            modeKey: 'code',
            assetKeys: ['phase5_session_rules_always_rule'],
        });
        expect(attachedAlwaysRule.isErr()).toBe(true);
        if (attachedAlwaysRule.isOk()) {
            throw new Error('Expected always rules to be rejected for manual attachment.');
        }
        expect(attachedAlwaysRule.error.code).toBe('invalid_payload');
        expect(attachedAlwaysRule.error.message).toContain('Only manual rules can be attached explicitly');
    });
});
