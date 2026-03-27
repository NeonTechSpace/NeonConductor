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
        skillQuery: '',
        setSkillQuery: vi.fn(),
        deferredSkillQuery: '',
        readModel: {
            workspaceRoots: [],
            selectedWorkspaceRoot: undefined,
            skillMatches: [],
            resolvedAgentModes: [],
            resolvedRules: [],
            resolvedSkills: [],
            discoveredGlobalModes: [],
            discoveredWorkspaceModes: [],
            discoveredGlobalRules: [],
            discoveredWorkspaceRules: [],
            discoveredGlobalSkills: [],
            discoveredWorkspaceSkills: [],
            globalAssetsRoot: 'C:/registry',
        },
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

        expect(html).toContain('grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]');
        expect(html).toContain('min-h-0 flex-1 overflow-y-auto p-5 md:p-6');
    });
});
