import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ComposerSlashCommandPopup } from '@/web/components/conversation/panels/composerSlashCommandPopup';

describe('ComposerSlashCommandPopup', () => {
    it('renders command availability and unavailable reasons', () => {
        const html = renderToStaticMarkup(
            <ComposerSlashCommandPopup
                state={{
                    kind: 'commands',
                    typedQuery: '',
                    highlightIndex: 0,
                    emptyMessage: '',
                    items: [
                        {
                            id: 'skills',
                            label: '/skills',
                            description: 'Attach or remove session skills.',
                            available: true,
                        },
                        {
                            id: 'rules',
                            label: '/rules',
                            description: 'Attach or remove manual rules.',
                            available: false,
                            unavailableReason: 'Select a session before using slash commands.',
                        },
                    ],
                }}
            />
        );

        expect(html).toContain('Slash Commands');
        expect(html).toContain('/skills');
        expect(html).toContain('Available');
        expect(html).toContain('/rules');
        expect(html).toContain('Unavailable');
        expect(html).toContain('Select a session before using slash commands.');
    });

    it('renders skill and rule result metadata with attached badges and warnings', () => {
        const skillsHtml = renderToStaticMarkup(
            <ComposerSlashCommandPopup
                state={{
                    kind: 'results',
                    commandId: 'skills',
                    query: 'debug',
                    highlightIndex: 0,
                    emptyMessage: '',
                    warningMessage:
                        'Unresolved attached skills will only be pruned if you explicitly change the attachment set.',
                    items: [
                        {
                            key: 'skill:workspace/debugger',
                            kind: 'skill',
                            assetKey: 'workspace/debugger',
                            label: 'Debugger',
                            description: 'Debugging helper skill.',
                            attached: true,
                            scope: 'workspace',
                            presetKey: 'code',
                        },
                    ],
                }}
            />
        );

        const rulesHtml = renderToStaticMarkup(
            <ComposerSlashCommandPopup
                state={{
                    kind: 'results',
                    commandId: 'rules',
                    query: 'manual',
                    highlightIndex: 0,
                    emptyMessage: '',
                    items: [
                        {
                            key: 'rule:workspace/manual-debug',
                            kind: 'rule',
                            assetKey: 'workspace/manual-debug',
                            label: 'Manual Debug',
                            description: 'Explicit debug rule.',
                            attached: false,
                            scope: 'global',
                            presetKey: 'debug',
                        },
                    ],
                }}
            />
        );

        expect(skillsHtml).toContain('Skill Selection');
        expect(skillsHtml).toContain('Debugger');
        expect(skillsHtml).toContain('Debugging helper skill.');
        expect(skillsHtml).toContain('Workspace');
        expect(skillsHtml).toContain('Attached');
        expect(skillsHtml).toContain(
            'Unresolved attached skills will only be pruned if you explicitly change the attachment set.'
        );

        expect(rulesHtml).toContain('Manual Rule Selection');
        expect(rulesHtml).toContain('Manual Debug');
        expect(rulesHtml).toContain('Explicit debug rule.');
        expect(rulesHtml).toContain('Global');
        expect(rulesHtml).toContain('debug');
    });
});
