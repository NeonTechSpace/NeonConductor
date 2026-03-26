import { settingsStore } from '@/app/backend/persistence/stores/profile/settingsStore';
import type { ProviderExecutionPreferenceRecord } from '@/app/backend/persistence/types';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import { resolveProviderRuntimePathContext } from '@/app/backend/providers/runtimePathContext';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import type { ProviderExecutionPreference } from '@/app/backend/runtime/contracts';
import { openAIExecutionModes, type OpenAIExecutionMode } from '@/app/backend/runtime/contracts';

const OPENAI_EXECUTION_PREFERENCE_KEY = 'provider_execution_preference:openai';
const OFFICIAL_OPENAI_BASE_URL = 'https://api.openai.com/v1';

type RealtimeDisabledReason = 'provider_not_supported' | 'api_key_required' | 'base_url_not_supported';

function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
    const trimmed = baseUrl?.trim();
    if (!trimmed) {
        return null;
    }

    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function isOfficialOpenAIBaseUrl(baseUrl: string | null | undefined): boolean {
    return normalizeBaseUrl(baseUrl) === OFFICIAL_OPENAI_BASE_URL;
}

export function isOpenAIExecutionMode(value: string): value is OpenAIExecutionMode {
    return openAIExecutionModes.some((mode) => mode === value);
}

export function normalizeStoredMode(value: string | undefined): OpenAIExecutionMode {
    if (value && isOpenAIExecutionMode(value)) {
        return value;
    }

    return 'standard_http';
}

function toExecutionPreferenceRecord(input: {
    providerId: 'openai';
    mode: OpenAIExecutionMode;
    canUseRealtimeWebSocket: boolean;
    disabledReason?: RealtimeDisabledReason;
}): ProviderExecutionPreferenceRecord {
    return {
        providerId: input.providerId,
        mode: input.mode,
        canUseRealtimeWebSocket: input.canUseRealtimeWebSocket,
        ...(input.disabledReason ? { disabledReason: input.disabledReason } : {}),
    };
}

async function resolveExecutionPreferenceState(
    profileId: string,
    providerId: 'openai'
): Promise<ProviderServiceResult<ProviderExecutionPreferenceRecord>> {
    const storedMode = normalizeStoredMode(
        await settingsStore.getStringOptional(profileId, OPENAI_EXECUTION_PREFERENCE_KEY)
    );
    const authState = await providerAuthExecutionService.getAuthState(profileId, providerId);
    const runtimePathResult = await resolveProviderRuntimePathContext(profileId, providerId);
    if (runtimePathResult.isErr()) {
        return errProviderService(runtimePathResult.error.code, runtimePathResult.error.message);
    }

    const canUseRealtimeWebSocket =
        authState.authMethod === 'api_key' && isOfficialOpenAIBaseUrl(runtimePathResult.value.resolvedBaseUrl);

    let disabledReason: RealtimeDisabledReason | undefined;
    if (authState.authMethod !== 'api_key') {
        disabledReason = 'api_key_required';
    } else if (!isOfficialOpenAIBaseUrl(runtimePathResult.value.resolvedBaseUrl)) {
        disabledReason = 'base_url_not_supported';
    }

    return okProviderService(
        toExecutionPreferenceRecord({
            providerId,
            mode: storedMode,
            canUseRealtimeWebSocket,
            ...(disabledReason ? { disabledReason } : {}),
        })
    );
}

export async function getExecutionPreferenceState(
    profileId: string,
    providerId: 'openai'
): Promise<ProviderServiceResult<ProviderExecutionPreference>> {
    return resolveExecutionPreferenceState(profileId, providerId);
}

export async function setExecutionPreferenceState(
    profileId: string,
    providerId: 'openai',
    mode: OpenAIExecutionMode
): Promise<ProviderServiceResult<ProviderExecutionPreference>> {
    await settingsStore.setString(profileId, OPENAI_EXECUTION_PREFERENCE_KEY, mode);
    return resolveExecutionPreferenceState(profileId, providerId);
}
