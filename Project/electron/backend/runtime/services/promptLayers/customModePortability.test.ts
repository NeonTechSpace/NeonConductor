import { describe, expect, it } from 'vitest';

import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';
import {
    buildCanonicalCustomModePayload,
    parsePortableCustomModeJson,
    toDraftModePayloadFromPortableImport,
    toPortableModePayload,
} from '@/app/backend/runtime/services/promptLayers/customModePortability';

describe('customModePortability', () => {
    it('accepts canonical role-template payloads', () => {
        expect(
            buildCanonicalCustomModePayload({
                slug: 'review-mode',
                name: 'Review Mode',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                tags: ['quality', 'review'],
            })
        ).toMatchObject({
            slug: 'review-mode',
            name: 'Review Mode',
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/review',
            tags: ['quality', 'review'],
        });
    });

    it('imports portable v2 payloads directly into mode drafts', () => {
        const parsed = parsePortableCustomModeJson(
            JSON.stringify({
                version: 2,
                slug: 'review',
                name: 'Review',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                description: 'Review mode',
            })
        );

        expect(
            toDraftModePayloadFromPortableImport({
                parsed,
            })
        ).toEqual({
            slug: 'review',
            name: 'Review',
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/review',
            description: 'Review mode',
        });
    });

    it('maps legacy portable payloads into drafts using the requested top-level tab', () => {
        const parsed = parsePortableCustomModeJson(
            JSON.stringify({
                slug: 'workspace-review',
                name: 'Workspace Review',
                customInstructions: 'Review carefully.',
                groups: ['read'],
            })
        );

        expect(
            toDraftModePayloadFromPortableImport({
                parsed,
                topLevelTab: 'agent',
            })
        ).toEqual({
            topLevelTab: 'agent',
            slug: 'workspace-review',
            name: 'Workspace Review',
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/ask',
            customInstructions: 'Review carefully.',
        });
    });

    it('exports file-backed custom modes as portable v2 only', () => {
        expect(
            toPortableModePayload({
                id: 'mode_test',
                profileId: 'profile_default',
                topLevelTab: 'agent',
                modeKey: 'review',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                internalModelRole: 'apply',
                delegatedOnly: false,
                sessionSelectable: true,
                label: 'Review',
                assetKey: 'review',
                prompt: {
                    roleDefinition: 'Act as a reviewer.',
                    customInstructions: 'Review carefully.',
                },
                promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
                executionPolicy: {
                    authoringRole: 'single_task_agent',
                    roleTemplate: 'single_task_agent/review',
                    internalModelRole: 'apply',
                },
                source: 'user',
                sourceKind: 'global_file',
                scope: 'global',
                description: 'Review mode',
                whenToUse: 'Use when reviewing.',
                tags: ['quality'],
                enabled: true,
                precedence: 0,
                createdAt: '2026-04-01T00:00:00.000Z',
                updatedAt: '2026-04-01T00:00:00.000Z',
            })
        ).toEqual({
            version: 2,
            slug: 'review',
            name: 'Review',
            authoringRole: 'single_task_agent',
            roleTemplate: 'single_task_agent/review',
            description: 'Review mode',
            roleDefinition: 'Act as a reviewer.',
            customInstructions: 'Review carefully.',
            whenToUse: 'Use when reviewing.',
            tags: ['quality'],
        });
    });
});
