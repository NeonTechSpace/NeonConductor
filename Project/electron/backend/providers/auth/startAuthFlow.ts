import { providerAuthFlowStore, providerAuthStore } from '@/app/backend/persistence/stores';
import { AUTH_METHODS_BY_PROVIDER } from '@/app/backend/providers/auth/constants';
import { plusSeconds } from '@/app/backend/providers/auth/helpers';
import { startOpenAIDeviceAuth, startOpenAIPkceAuth } from '@/app/backend/providers/auth/openaiOAuthClient';
import type { StartAuthResult } from '@/app/backend/providers/auth/types';
import { kiloGatewayClient } from '@/app/backend/providers/kiloGatewayClient';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

function assertMethodAllowed(providerId: RuntimeProviderId, method: ProviderAuthMethod): void {
    if (!AUTH_METHODS_BY_PROVIDER[providerId].includes(method)) {
        throw new Error(`Auth method "${method}" is not supported for provider "${providerId}".`);
    }
}

export async function startAuthFlow(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    method: ProviderAuthMethod;
}): Promise<StartAuthResult> {
    assertMethodAllowed(input.providerId, input.method);
    await providerAuthFlowStore.cancelPendingByProvider(input.profileId, input.providerId);

    if (input.providerId === 'kilo' && input.method === 'device_code') {
        const device = await kiloGatewayClient.createDeviceCode();
        const flow = await providerAuthFlowStore.create({
            profileId: input.profileId,
            providerId: input.providerId,
            flowType: 'device_code',
            authMethod: 'device_code',
            deviceCode: device.code,
            userCode: device.userCode,
            verificationUri: device.verificationUri,
            pollIntervalSeconds: device.pollIntervalSeconds,
            expiresAt: device.expiresAt,
        });
        await providerAuthStore.upsert({
            profileId: input.profileId,
            providerId: input.providerId,
            authMethod: 'device_code',
            authState: 'pending',
        });

        return {
            flow,
            pollAfterSeconds: device.pollIntervalSeconds,
            verificationUri: device.verificationUri,
            userCode: device.userCode,
        };
    }

    if (input.providerId === 'openai' && input.method === 'oauth_pkce') {
        const pkce = startOpenAIPkceAuth();
        const flow = await providerAuthFlowStore.create({
            profileId: input.profileId,
            providerId: input.providerId,
            flowType: 'oauth_pkce',
            authMethod: 'oauth_pkce',
            state: pkce.state,
            nonce: pkce.nonce,
            codeVerifier: pkce.codeVerifier,
            expiresAt: plusSeconds(15 * 60),
        });
        await providerAuthStore.upsert({
            profileId: input.profileId,
            providerId: input.providerId,
            authMethod: 'oauth_pkce',
            authState: 'pending',
        });

        return {
            flow,
            authorizeUrl: pkce.authorizeUrl,
        };
    }

    if (input.providerId === 'openai' && input.method === 'oauth_device') {
        const device = await startOpenAIDeviceAuth();
        const flow = await providerAuthFlowStore.create({
            profileId: input.profileId,
            providerId: input.providerId,
            flowType: 'oauth_device',
            authMethod: 'oauth_device',
            deviceCode: device.deviceCode,
            userCode: device.userCode,
            verificationUri: device.verificationUri,
            pollIntervalSeconds: device.intervalSeconds,
            expiresAt: plusSeconds(device.expiresInSeconds),
        });
        await providerAuthStore.upsert({
            profileId: input.profileId,
            providerId: input.providerId,
            authMethod: 'oauth_device',
            authState: 'pending',
        });

        return {
            flow,
            pollAfterSeconds: device.intervalSeconds,
            verificationUri: device.verificationUri,
            userCode: device.userCode,
        };
    }

    throw new Error(`Auth method "${input.method}" is not implemented for provider "${input.providerId}".`);
}
