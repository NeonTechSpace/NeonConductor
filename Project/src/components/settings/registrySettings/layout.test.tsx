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
            globalModeRoot: 'C:/registry/modes',
            globalNativeRoot: 'C:/Users/test/.neonconductor',
            workspaceModeRoot: undefined,
            workspaceNativeRoot: undefined,
            globalDiagnostics: [],
            workspaceDiagnostics: [],
        },
        registryQuery: {
            data: {
                paths: {
                    modeRoots: {
                        globalRoot: 'C:/registry/modes',
                    },
                    nativeRulesSkillsRoots: {
                        globalRoot: 'C:/Users/test/.neonconductor',
                    },
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
                diagnostics: {
                    global: [],
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
    it('renders registry content without a nested settings rail', () => {
        const html = renderToStaticMarkup(<RegistrySettingsScreen profileId='profile_default' />);

        expect(html).toContain('Rules, Skills &amp; Modes');
        expect(html).toContain('min-h-0 min-w-0 overflow-y-auto');
    });
});
