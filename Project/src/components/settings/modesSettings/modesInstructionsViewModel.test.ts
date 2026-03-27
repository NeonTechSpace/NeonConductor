import { describe, expect, it } from 'vitest';

import { buildModesInstructionsViewModel } from '@/web/components/settings/modesSettings/modesInstructionsViewModel';

describe('buildModesInstructionsViewModel', () => {
    it('orders prompt layers and preserves workspace mode-library scope details', () => {
        const viewModel = buildModesInstructionsViewModel({
            appGlobalValue: 'app',
            appGlobalIsSaving: false,
            profileGlobalValue: 'profile',
            profileGlobalIsSaving: true,
            topLevelValues: {
                chat: 'chat',
                agent: 'agent',
                orchestrator: 'orch',
            },
            topLevelIsSaving: false,
            builtInModesByTab: {
                chat: [],
                agent: [
                    {
                        topLevelTab: 'agent',
                        modeKey: 'code',
                        label: 'Agent Code',
                        prompt: {
                            roleDefinition: 'role',
                            customInstructions: 'instructions',
                        },
                        hasOverride: true,
                    },
                ],
                orchestrator: [],
            },
            builtInModesIsSaving: true,
            fileBackedGlobalModes: {
                chat: [],
                agent: [],
                orchestrator: [],
            },
            fileBackedWorkspaceModes: {
                chat: [],
                agent: [],
                orchestrator: [],
            },
            hasWorkspaceScope: true,
            selectedWorkspaceLabel: 'Workspace Root',
        });

        expect(viewModel.promptLayers.appGlobal.value).toBe('app');
        expect(viewModel.promptLayers.profileGlobal.isSaving).toBe(true);
        expect(viewModel.promptLayers.topLevel.map((section) => section.topLevelTab)).toEqual([
            'chat',
            'agent',
            'orchestrator',
        ]);
        expect(viewModel.builtInModeSections).toHaveLength(1);
        expect(viewModel.builtInModeSections[0]?.cards[0]?.label).toBe('Agent Code');
        expect(viewModel.modeLibrary.hasWorkspaceScope).toBe(true);
        expect(viewModel.modeLibrary.selectedWorkspaceLabel).toBe('Workspace Root');
    });
});
