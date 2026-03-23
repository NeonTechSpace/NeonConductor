import { providerAuthFlowStore, providerAuthStore } from '@/app/backend/persistence/stores';
import { getAuthMethodsForProvider } from '@/app/backend/providers/auth/constants';
import { errAuthExecution, okAuthExecution, type AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import { plusSeconds } from '@/app/backend/providers/auth/helpers';
import { startOpenAIDeviceAuth, startOpenAIPkceAuth } from '@/app/backend/providers/auth/openaiOAuthClient';
import type { StartAuthResult } from '@/app/backend/providers/auth/types';
import { kiloGatewayClient } from '@/app/backend/providers/kiloGatewayClient';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

function toGatewayAuthError(input: { message: string; code: 'provider_request_failed' | 'provider_request_unavailable' }) {
    return errAuthExecution(input.code, input.message);
}

function assertMethodAllowed(providerId: RuntimeProviderId, method: ProviderAuthMethod): AuthExecutionResult<void> {
    if (!getAuthMethodsForProvider(providerId).includes(method)) {
        return errAuthExecution(
            'method_not_supported',
            `Auth method "${method}" is not supported for provider "${providerId}".`
        );
    }

    return okAuthExecution(undefined);
}

export async function startAuthFlow(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    method: ProviderAuthMethod;
}): Promise<AuthExecutionResult<StartAuthResult>> {
    const methodAllowed = assertMethodAllowed(input.providerId, input.method);
    if (methodAllowed.isErr()) {
        return errAuthExecution(methodAllowed.error.code, methodAllowed.error.message);
    }
    await providerAuthFlowStore.cancelPendingByProvider(input.profileId, input.providerId);

    if (input.providerId === 'kilo' && input.method === 'device_code') {
        const deviceResult = await kiloGatewayClient.createDeviceCode();
        if (deviceResult.isErr()) {
            return toGatewayAuthError({
                code:
                    deviceResult.error.code === 'timeout' || deviceResult.error.code === 'network_error'
                        ? 'provider_request_unavailable'
                        : 'provider_request_failed',
                message: deviceResult.error.message,
            });
        }
        const device = deviceResult.value;
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

        return okAuthExecution({
            flow,
            pollAfterSeconds: device.pollIntervalSeconds,
            verificationUri: device.verificationUri,
            userCode: device.userCode,
        });
    }

    if (input.providerId === 'openai_codex' && input.method === 'oauth_pkce') {
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

        return okAuthExecution({
            flow,
            authorizeUrl: pkce.authorizeUrl,
        });
    }

    if (input.providerId === 'openai_codex' && input.method === 'oauth_device') {
        const deviceResult = await startOpenAIDeviceAuth();
        if (deviceResult.isErr()) {
            return errAuthExecution(deviceResult.error.code, deviceResult.error.message);
        }
        const device = deviceResult.value;
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

        return okAuthExecution({
            flow,
            pollAfterSeconds: device.intervalSeconds,
            verificationUri: device.verificationUri,
            userCode: device.userCode,
        });
    }

    return errAuthExecution(
        'method_not_implemented',
        `Auth method "${input.method}" is not implemented for provider "${input.providerId}".`
    );
}
