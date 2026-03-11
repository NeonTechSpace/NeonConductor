import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/settings/registrySettings/controller', () => ({
    useRegistrySettingsController: () => ({
        feedbackMessage: undefined,
        feedbackTone: 'info',
        refreshMutation: {
            isPending: false,
            mutateAsync: vi.fn(),
        },
        selectedWorkspaceFingerprint: undefined,
        setSelectedWorkspaceFingerprint: vi.fn(),
        selectedWorkspaceRoot: undefined,
        workspaceRoots: [],
        skillQuery: '',
        setSkillQuery: vi.fn(),
        skillMatches: [],
        resolvedAgentModes: [],
        registryQuery: {
            data: {
                paths: {
                    globalAssetsRoot: 'C:/registry',
                },
                resolved: {
                    rulesets: [],
                    skillfiles: [],
                },
                discovered: {
                    global: {
                        modes: [],
                        rulesets: [],
                        skillfiles: [],
                    },
                },
            },
        },
    }),
}));

vi.mock('@/web/components/settings/registrySettings/components', () => ({
    AssetCard: () => <article>asset card</article>,
    AssetSection: ({ title }: { title: string }) => <section>{title}</section>,
    SummaryCard: ({ label }: { label: string }) => <article>{label}</article>,
}));

vi.mock('@/web/components/settings/shared/settingsFeedbackBanner', () => ({
    SettingsFeedbackBanner: () => null,
}));

import { RegistrySettingsScreen } from '@/web/components/settings/registrySettings/view';

describe('registry settings layout', () => {
    it('wraps long registry content in an inner scroll container', () => {
        const html = renderToStaticMarkup(<RegistrySettingsScreen profileId='profile_default' />);

        expect(html).toContain('flex h-full min-h-0 min-w-0 flex-col overflow-hidden');
        expect(html).toContain('min-h-0 flex-1 overflow-y-auto p-4');
    });
});
