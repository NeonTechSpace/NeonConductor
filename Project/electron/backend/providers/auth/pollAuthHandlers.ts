import { providerAuthFlowStore, providerAuthStore } from '@/app/backend/persistence/stores';
import type { ProviderAuthFlowRecord } from '@/app/backend/persistence/types';
import { getAuthState, persistAuthenticatedState } from '@/app/backend/providers/auth/authStateService';
import { nowIso } from '@/app/backend/providers/auth/helpers';
import { syncKiloAccountContext } from '@/app/backend/providers/auth/kiloAccountSync';
import { exchangeOpenAIDeviceCode } from '@/app/backend/providers/auth/openaiOAuthClient';
import type { PollAuthResult } from '@/app/backend/providers/auth/types';
import { kiloGatewayClient } from '@/app/backend/providers/kiloGatewayClient';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export async function requireFlow(
    profileId: string,
    providerId: RuntimeProviderId,
    flowId: string
): Promise<ProviderAuthFlowRecord> {
    const flow = await providerAuthFlowStore.getByProfileProviderAndId(profileId, providerId, flowId);
    if (!flow) {
        throw new Error(`Auth flow "${flowId}" was not found.`);
    }

    return flow;
}

export async function handleKiloDevicePoll(flow: ProviderAuthFlowRecord): Promise<PollAuthResult> {
    const status = await kiloGatewayClient.getDeviceCodeStatus(flow.deviceCode ?? '');
    if (status.status === 'pending') {
        return { flow, state: await getAuthState(flow.profileId, flow.providerId) };
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
        return { flow: failedFlow ?? flow, state: await getAuthState(flow.profileId, flow.providerId) };
    }

    if (!status.accessToken) {
        throw new Error('Kilo device auth approval did not include access token.');
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
    await syncKiloAccountContext({
        profileId: flow.profileId,
        accessToken: status.accessToken,
        ...(status.organizationId ? { organizationId: status.organizationId } : {}),
    });

    return { flow: completedFlow ?? flow, state };
}

export async function handleOpenAIDevicePoll(flow: ProviderAuthFlowRecord): Promise<PollAuthResult> {
    const token = await exchangeOpenAIDeviceCode(flow.deviceCode ?? '');
    if (!token) {
        return { flow, state: await getAuthState(flow.profileId, flow.providerId) };
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

    return { flow: completedFlow ?? flow, state };
}
