import { settingsStore } from '@/app/backend/persistence/stores';
import type { ExecutionPreset } from '@/app/backend/runtime/contracts';

const EXECUTION_PRESET_SETTING_KEY = 'profile_execution_preset';
const DEFAULT_EXECUTION_PRESET: ExecutionPreset = 'standard';

function isExecutionPreset(value: string | undefined): value is ExecutionPreset {
    return value === 'privacy' || value === 'standard' || value === 'yolo';
}

export async function getExecutionPreset(profileId: string): Promise<ExecutionPreset> {
    const stored = await settingsStore.getStringOptional(profileId, EXECUTION_PRESET_SETTING_KEY);
    return isExecutionPreset(stored) ? stored : DEFAULT_EXECUTION_PRESET;
}

export async function setExecutionPreset(profileId: string, preset: ExecutionPreset): Promise<ExecutionPreset> {
    await settingsStore.setString(profileId, EXECUTION_PRESET_SETTING_KEY, preset);
    return preset;
}
