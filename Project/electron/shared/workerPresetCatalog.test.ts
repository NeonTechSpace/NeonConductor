import { describe, expect, it } from 'vitest';

import { getWorkerPresetDefinition, isWorkerPresetId, listWorkerPresetDefinitions } from '@/shared/workerPresetCatalog';

describe('workerPresetCatalog', () => {
    it('keeps first-alpha worker presets explicit and non-mutating by default', () => {
        const presets = listWorkerPresetDefinitions();

        expect(presets.map((preset) => preset.id)).toEqual([
            'code_explorer',
            'web_researcher',
            'ui_verifier',
            'patch_reviewer',
            'dependency_auditor',
        ]);
        expect(presets.every((preset) => preset.topLevelTab === 'agent')).toBe(true);
        expect(presets.every((preset) => preset.modeKey === 'research')).toBe(true);
        expect(presets.every((preset) => !preset.toolCapabilities.includes('filesystem_write'))).toBe(true);
        expect(presets.every((preset) => preset.resultContractLabel.trim().length > 0)).toBe(true);
    });

    it('resolves known presets and rejects unknown ids at the boundary', () => {
        expect(getWorkerPresetDefinition('code_explorer')).toMatchObject({
            label: 'Code Explorer',
            roleTemplate: 'single_task_agent/research',
        });
        expect(isWorkerPresetId('code_explorer')).toBe(true);
        expect(isWorkerPresetId('code-explorer')).toBe(false);
    });
});
