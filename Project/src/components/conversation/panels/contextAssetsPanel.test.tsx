import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { attachmentHookMock } = vi.hoisted(() => ({
    attachmentHookMock: vi.fn(),
}));

vi.mock('@/web/components/conversation/panels/useContextAssetAttachmentController', () => ({
    useContextAssetAttachmentController: attachmentHookMock,
}));

vi.mock('@/web/lib/hooks/useDebouncedQueryValue', () => ({
    useDebouncedQueryValue: (value: string) => value,
}));

import { ContextAssetsPanel } from '@/web/components/conversation/panels/contextAssetsPanel';

describe('ContextAssetsPanel', () => {
    it('shows dynamic skill badges for attached and searchable skills', () => {
        attachmentHookMock.mockReturnValue({
            readModel: {
                attachedRules: [],
                missingAttachedRuleKeys: [],
                attachedRuleAssetKeys: [],
                attachedRuleAssetKeySet: new Set<string>(),
                attachedSkills: [
                    {
                        id: 'skill_attached',
                        profileId: 'profile_default',
                        assetKey: 'skills/review',
                        name: 'Review',
                        bodyMarkdown: '# Review skill',
                        dynamicContextSources: [
                            {
                                id: 'repo_status',
                                label: 'Repo status',
                                command: 'git status',
                                declaredSafetyClass: 'safe',
                                required: true,
                                validationState: 'valid',
                                effectiveSafetyClass: 'safe',
                            },
                            {
                                id: 'custom_report',
                                label: 'Custom report',
                                command: 'node scripts/report.js',
                                declaredSafetyClass: 'safe',
                                required: false,
                                validationState: 'valid',
                                effectiveSafetyClass: 'unsafe',
                            },
                        ],
                        source: 'workspace',
                        sourceKind: 'workspace_file',
                        scope: 'workspace',
                        enabled: true,
                        precedence: 1,
                        createdAt: '2026-01-01T00:00:00.000Z',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                    },
                ],
                missingAttachedSkillKeys: [],
                attachedSkillAssetKeys: ['skills/review'],
                attachedSkillAssetKeySet: new Set(['skills/review']),
                resolvedManualRules: [],
                resolvedSkills: [],
                visibleManualRules: [],
                visibleSkills: [
                    {
                        id: 'skill_search',
                        profileId: 'profile_default',
                        assetKey: 'skills/debug',
                        name: 'Debug',
                        bodyMarkdown: '# Debug skill',
                        dynamicContextSources: [
                            {
                                id: 'invalid_chain',
                                label: 'Invalid chain',
                                command: 'git status && git diff',
                                declaredSafetyClass: 'safe',
                                required: false,
                                validationState: 'invalid',
                                validationMessage: 'single command only',
                            },
                        ],
                        source: 'workspace',
                        sourceKind: 'workspace_file',
                        scope: 'workspace',
                        enabled: true,
                        precedence: 2,
                        createdAt: '2026-01-01T00:00:00.000Z',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                    },
                ],
                isRefreshingRules: false,
                isRefreshingSkills: false,
            },
            isBusy: false,
            mutationError: undefined,
            detachRule: vi.fn(),
            detachSkill: vi.fn(),
            attachRule: vi.fn(),
            attachSkill: vi.fn(),
        });

        const html = renderToStaticMarkup(
            createElement(ContextAssetsPanel, {
                profileId: 'profile_default',
                sessionId: 'sess_test',
                topLevelTab: 'agent',
                modeKey: 'code',
                attachedRules: [],
                missingAttachedRuleKeys: [],
                attachedSkills: [],
                missingAttachedSkillKeys: [],
            })
        );

        expect(html).toContain('2 dynamic');
        expect(html).toContain('1 unsafe');
        expect(html).toContain('1 invalid');
    });
});
