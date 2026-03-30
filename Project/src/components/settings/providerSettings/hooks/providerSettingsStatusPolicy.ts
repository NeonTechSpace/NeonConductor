import type { OpenAIExecutionMode } from '@/shared/contracts';

export function getDefaultUpdateFailureStatusMessage(reason: string | null | undefined): string {
    return reason === 'model_not_found' ? 'Selected model is not available.' : 'Default update failed.';
}

export function getDefaultUpdateSuccessStatusMessage(): string {
    return 'Default provider/model updated.';
}

export function getUnsupportedDefaultProviderStatusMessage(): string {
    return 'Default update returned an unsupported provider.';
}

export function getApiKeySavedStatusMessage(): string {
    return 'API key saved. Provider is ready.';
}

export function getProviderNotFoundStatusMessage(): string {
    return 'Provider not found.';
}

export function getConnectionProfileUpdatedStatusMessage(): string {
    return 'Connection profile updated.';
}

export function getCatalogSyncFailureStatusMessage(reason: string | null | undefined): string {
    return reason ? `Catalog sync failed: ${reason}` : 'Catalog sync failed.';
}

export function getCatalogSyncSuccessStatusMessage(modelCount: number, catalogStateReason: string | undefined): string | undefined {
    if (modelCount > 0) {
        return `Catalog synced (${String(modelCount)} models).`;
    }

    if (catalogStateReason === 'catalog_empty_after_normalization') {
        return 'Catalog refreshed, but no usable models were found.';
    }

    return undefined;
}

export function getExecutionPreferenceStatusMessage(mode: OpenAIExecutionMode): string {
    return mode === 'realtime_websocket'
        ? 'Realtime WebSocket enabled for OpenAI agent and orchestrator runs.'
        : 'Standard HTTP restored for OpenAI runs.';
}

export function getOrganizationUpdatedStatusMessage(): string {
    return 'Kilo organization updated.';
}

export function getAuthFlowStartedStatusMessage(methodLabel: string): string {
    return `${methodLabel} flow started.`;
}

export function getAuthFlowWaitingStatusMessage(): string {
    return 'Waiting for authorization confirmation...';
}

export function getAuthFlowCompletedStatusMessage(flowStatus: string, authState: string): string {
    return `Auth flow ${flowStatus}. State: ${authState}.`;
}

export function getAuthFlowCancelledStatusMessage(): string {
    return 'Auth flow cancelled.';
}

export function getOpenExternalUrlFallbackStatusMessage(): string {
    return 'Sign-in started. Open the verification page from the auth card if your browser did not open.';
}
