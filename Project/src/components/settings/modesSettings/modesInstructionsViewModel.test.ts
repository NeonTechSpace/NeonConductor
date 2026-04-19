import { describe, expect, it } from 'vitest';

import { buildModesInstructionsViewModel } from '@/web/components/settings/modesSettings/modesInstructionsViewModel';
import {
    createDefaultPreparedContextModeOverridesSnapshot,
    createDefaultPreparedContextProfileDefaultsSnapshot,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';

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
            preparedContextProfileDefaults: createDefaultPreparedContextProfileDefaultsSnapshot(),
            builtInModesByTab: {
                chat: [],
                agent: [
                    {
                        topLevelTab: 'agent',
                        modeKey: 'code',
                        authoringRole: 'single_task_agent',
                        roleTemplate: 'single_task_agent/apply',
                        internalModelRole: 'apply',
                        label: 'Agent Code',
                        prompt: {
                            roleDefinition: 'role',
                            customInstructions: 'instructions',
                        },
                        promptLayerOverrides: createDefaultPreparedContextModeOverridesSnapshot(),
                        hasOverride: true,
                    },
                ],
                orchestrator: [],
            },
            builtInModesIsSaving: true,
            builtInToolMetadata: [
                {
                    toolId: 'write_file',
                    label: 'Write File',
                    description: 'Write the full contents of a file.',
                    defaultDescription: 'Write the full contents of a file.',
                    isModified: false,
                },
            ],
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
        expect(viewModel.builtInToolMetadata.items[0]?.toolId).toBe('write_file');
        expect(viewModel.modeLibrary.hasWorkspaceScope).toBe(true);
        expect(viewModel.modeLibrary.selectedWorkspaceLabel).toBe('Workspace Root');
    });
});
