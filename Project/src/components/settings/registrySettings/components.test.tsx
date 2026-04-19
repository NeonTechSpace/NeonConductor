import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AssetCard } from '@/web/components/settings/registrySettings/components';

describe('registry skill asset cards', () => {
    it('shows dynamic-skill diagnostics for skill assets', () => {
        const html = renderToStaticMarkup(
            createElement(AssetCard, {
                asset: {
                    id: 'skill_1',
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
                    precedence: 1,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
                title: 'Review',
                subtitle: 'skills/review',
                bodyMarkdown: '# Review skill',
            })
        );

        expect(html).toContain('3 dynamic sources');
        expect(html).toContain('1 unsafe');
        expect(html).toContain('1 invalid');
    });
});
