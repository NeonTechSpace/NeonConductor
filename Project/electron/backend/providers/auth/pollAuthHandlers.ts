import { providerAuthFlowStore, providerAuthStore } from '@/app/backend/persistence/stores';
import type { ProviderAuthFlowRecord } from '@/app/backend/persistence/types';
import { getAuthState, persistAuthenticatedState } from '@/app/backend/providers/auth/authStateService';
import { errAuthExecution, okAuthExecution, type AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import { nowIso } from '@/app/backend/providers/auth/helpers';
import { syncKiloAccountContext } from '@/app/backend/providers/auth/kiloAccountSync';
import { exchangeOpenAIDeviceCode } from '@/app/backend/providers/auth/openaiOAuthClient';
import type { PollAuthResult } from '@/app/backend/providers/auth/types';
import { kiloGatewayClient } from '@/app/backend/providers/kiloGatewayClient';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

function toGatewayAuthExecutionError(input: {
    code: 'timeout' | 'http_error' | 'schema_error' | 'network_error';
    message: string;
}) {
    return errAuthExecution(
        input.code === 'timeout' || input.code === 'network_error'
            ? 'provider_request_unavailable'
            : 'provider_request_failed',
        input.message
    );
}

export async function requireFlow(
    profileId: string,
    providerId: RuntimeProviderId,
    flowId: string
): Promise<AuthExecutionResult<ProviderAuthFlowRecord>> {
    const flow = await providerAuthFlowStore.getByProfileProviderAndId(profileId, providerId, flowId);
    if (!flow) {
        return errAuthExecution('flow_not_found', `Auth flow "${flowId}" was not found.`);
    }

    return okAuthExecution(flow);
}

export async function handleKiloDevicePoll(flow: ProviderAuthFlowRecord): Promise<AuthExecutionResult<PollAuthResult>> {
    const statusResult = await kiloGatewayClient.getDeviceCodeStatus(flow.deviceCode ?? '');
    if (statusResult.isErr()) {
        return toGatewayAuthExecutionError(statusResult.error);
    }
    const status = statusResult.value;
    if (status.status === 'pending') {
        return okAuthExecution({ flow, state: await getAuthState(flow.profileId, flow.providerId) });
    }

    if (status.status === 'expired' || status.status === 'denied') {
        const failedFlow = await providerAuthFlowStore.updateStatus(flow.id, {
            status: status.status === 'expired' ? 'expired' : 'failed',
            lastErrorCode: status.status,
            lastErrorMessage: `Kilo device auth ${status.status}.`,
            consumedAt: nowIso(),
        });
        await providerAuthStore.upsert({
            profileId: flow.profileId,
            providerId: flow.providerId,
            authMethod: 'device_code',
            authState: status.status === 'expired' ? 'expired' : 'error',
            lastErrorCode: status.status,
            lastErrorMessage: `Kilo device auth ${status.status}.`,
        });
        return okAuthExecution({
            flow: failedFlow ?? flow,
            state: await getAuthState(flow.profileId, flow.providerId),
        });
    }

    if (!status.accessToken) {
        return errAuthExecution('invalid_payload', 'Kilo device auth approval did not include access token.');
    }

    const state = await persistAuthenticatedState({
        profileId: flow.profileId,
        providerId: flow.providerId,
        authMethod: 'device_code',
        accessToken: status.accessToken,
        ...(status.refreshToken ? { refreshToken: status.refreshToken } : {}),
        ...(status.expiresAt ? { tokenExpiresAt: status.expiresAt } : {}),
        ...(status.accountId ? { accountId: status.accountId } : {}),
        ...(status.organizationId ? { organizationId: status.organizationId } : {}),
    });
    const completedFlow = await providerAuthFlowStore.updateStatus(flow.id, {
        status: 'completed',
        consumedAt: nowIso(),
    });
    const syncResult = await syncKiloAccountContext({
        profileId: flow.profileId,
        accessToken: status.accessToken,
        ...(status.organizationId ? { organizationId: status.organizationId } : {}),
        ...(status.expiresAt ? { tokenExpiresAt: status.expiresAt } : {}),
    });
    if (syncResult.isErr()) {
        return errAuthExecution(syncResult.error.code, syncResult.error.message);
    }

    return okAuthExecution({ flow: completedFlow ?? flow, state });
}

export async function handleOpenAIDevicePoll(
    flow: ProviderAuthFlowRecord
): Promise<AuthExecutionResult<PollAuthResult>> {
    const tokenResult = await exchangeOpenAIDeviceCode(flow.deviceCode ?? '');
    if (tokenResult.isErr()) {
        return errAuthExecution(tokenResult.error.code, tokenResult.error.message);
    }

    const token = tokenResult.value;
    if (!token) {
        return okAuthExecution({ flow, state: await getAuthState(flow.profileId, flow.providerId) });
    }

    const state = await persistAuthenticatedState({
        profileId: flow.profileId,
        providerId: flow.providerId,
        authMethod: 'oauth_device',
        accessToken: token.accessToken,
        ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
        ...(token.expiresAt ? { tokenExpiresAt: token.expiresAt } : {}),
        ...(token.accountId ? { accountId: token.accountId } : {}),
    });
    const completedFlow = await providerAuthFlowStore.updateStatus(flow.id, {
        status: 'completed',
        consumedAt: nowIso(),
    });

    return okAuthExecution({ flow: completedFlow ?? flow, state });
}
