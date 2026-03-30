import { describe, expect, it } from 'vitest';

import {
    getApiKeySavedStatusMessage,
    getAuthFlowCancelledStatusMessage,
    getAuthFlowCompletedStatusMessage,
    getAuthFlowStartedStatusMessage,
    getAuthFlowWaitingStatusMessage,
    getCatalogSyncFailureStatusMessage,
    getCatalogSyncSuccessStatusMessage,
    getConnectionProfileUpdatedStatusMessage,
    getDefaultUpdateFailureStatusMessage,
    getDefaultUpdateSuccessStatusMessage,
    getExecutionPreferenceStatusMessage,
    getOpenExternalUrlFallbackStatusMessage,
    getOrganizationUpdatedStatusMessage,
    getProviderNotFoundStatusMessage,
    getUnsupportedDefaultProviderStatusMessage,
} from '@/web/components/settings/providerSettings/hooks/providerSettingsStatusPolicy';

describe('provider settings status policy', () => {
    it('keeps the provider mutation status messages stable', () => {
        expect(getDefaultUpdateFailureStatusMessage('model_not_found')).toBe('Selected model is not available.');
        expect(getDefaultUpdateFailureStatusMessage(undefined)).toBe('Default update failed.');
        expect(getDefaultUpdateSuccessStatusMessage()).toBe('Default provider/model updated.');
        expect(getUnsupportedDefaultProviderStatusMessage()).toBe('Default update returned an unsupported provider.');
        expect(getApiKeySavedStatusMessage()).toBe('API key saved. Provider is ready.');
        expect(getProviderNotFoundStatusMessage()).toBe('Provider not found.');
        expect(getConnectionProfileUpdatedStatusMessage()).toBe('Connection profile updated.');
        expect(getCatalogSyncFailureStatusMessage('missing credential')).toBe('Catalog sync failed: missing credential');
        expect(getCatalogSyncFailureStatusMessage(undefined)).toBe('Catalog sync failed.');
        expect(getCatalogSyncSuccessStatusMessage(3, undefined)).toBe('Catalog synced (3 models).');
        expect(getCatalogSyncSuccessStatusMessage(0, 'catalog_empty_after_normalization')).toBe(
            'Catalog refreshed, but no usable models were found.'
        );
        expect(getCatalogSyncSuccessStatusMessage(0, undefined)).toBeUndefined();
        expect(getExecutionPreferenceStatusMessage('realtime_websocket')).toBe(
            'Realtime WebSocket enabled for OpenAI agent and orchestrator runs.'
        );
        expect(getExecutionPreferenceStatusMessage('standard_http')).toBe('Standard HTTP restored for OpenAI runs.');
        expect(getOrganizationUpdatedStatusMessage()).toBe('Kilo organization updated.');
        expect(getAuthFlowStartedStatusMessage('OAuth device')).toBe('OAuth device flow started.');
        expect(getAuthFlowWaitingStatusMessage()).toBe('Waiting for authorization confirmation...');
        expect(getAuthFlowCompletedStatusMessage('complete', 'authenticated')).toBe(
            'Auth flow complete. State: authenticated.'
        );
        expect(getAuthFlowCancelledStatusMessage()).toBe('Auth flow cancelled.');
        expect(getOpenExternalUrlFallbackStatusMessage()).toBe(
            'Sign-in started. Open the verification page from the auth card if your browser did not open.'
        );
    });
});
