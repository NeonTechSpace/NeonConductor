import { providerAuthFlowStore, providerAuthStore } from '@/app/backend/persistence/stores';
import { getAuthState, persistAuthenticatedState } from '@/app/backend/providers/auth/authStateService';
import { errAuthExecution, okAuthExecution, type AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import { nowIso } from '@/app/backend/providers/auth/helpers';
import { exchangeOpenAIAuthorizationCode } from '@/app/backend/providers/auth/openaiOAuthClient';
import {
    handleKiloDevicePoll,
    handleOpenAIDevicePoll,
    requireFlow,
} from '@/app/backend/providers/auth/pollAuthHandlers';
import type { PollAuthResult } from '@/app/backend/providers/auth/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export async function pollAuthFlow(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    flowId: string;
}): Promise<AuthExecutionResult<PollAuthResult>> {
    const flowResult = await requireFlow(input.profileId, input.providerId, input.flowId);
    if (flowResult.isErr()) {
        return errAuthExecution(flowResult.error.code, flowResult.error.message);
    }
    const flow = flowResult.value;
    if (flow.status !== 'pending') {
        return okAuthExecution({ flow, state: await getAuthState(input.profileId, input.providerId) });
    }

    if (Date.parse(flow.expiresAt) <= Date.now()) {
        const expiredFlow = await providerAuthFlowStore.updateStatus(flow.id, {
            status: 'expired',
            lastErrorCode: 'expired',
            lastErrorMessage: 'Authentication flow expired.',
            consumedAt: nowIso(),
        });
        await providerAuthStore.upsert({
            profileId: input.profileId,
            providerId: input.providerId,
            authMethod: flow.authMethod,
            authState: 'expired',
            lastErrorCode: 'expired',
            lastErrorMessage: 'Authentication flow expired.',
        });
        return okAuthExecution({
            flow: expiredFlow ?? flow,
            state: await getAuthState(input.profileId, input.providerId),
        });
    }

    if (flow.providerId === 'kilo' && flow.flowType === 'device_code') {
        return handleKiloDevicePoll(flow);
    }

    if (flow.providerId === 'openai_codex' && flow.flowType === 'oauth_device') {
        return handleOpenAIDevicePoll(flow);
    }

    return okAuthExecution({ flow, state: await getAuthState(input.profileId, input.providerId) });
}

export async function completeAuthFlow(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    flowId: string;
    code?: string;
}): Promise<AuthExecutionResult<PollAuthResult>> {
    const flowResult = await requireFlow(input.profileId, input.providerId, input.flowId);
    if (flowResult.isErr()) {
        return errAuthExecution(flowResult.error.code, flowResult.error.message);
    }
    const flow = flowResult.value;
    if (flow.providerId !== 'openai_codex' || flow.flowType !== 'oauth_pkce') {
        return pollAuthFlow(input);
    }

    const code = input.code?.trim();
    if (!code) {
        return errAuthExecution('pkce_code_required', 'OAuth completion for PKCE flow requires "code".');
    }

    const tokenResult = await exchangeOpenAIAuthorizationCode(code, flow.codeVerifier ?? '');
    if (tokenResult.isErr()) {
        return errAuthExecution(tokenResult.error.code, tokenResult.error.message);
    }
    const token = tokenResult.value;
    const state = await persistAuthenticatedState({
        profileId: flow.profileId,
        providerId: flow.providerId,
        authMethod: 'oauth_pkce',
        accessToken: token.accessToken,
        ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
        ...(token.expiresAt ? { tokenExpiresAt: token.expiresAt } : {}),
        ...(token.accountId ? { accountId: token.accountId } : {}),
    });
    const completedFlow = await providerAuthFlowStore.updateStatus(flow.id, {
        status: 'completed',
        consumedAt: nowIso(),
    });

    return okAuthExecution({
        flow: completedFlow ?? flow,
        state,
    });
}

export async function cancelAuthFlow(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    flowId: string;
}): Promise<AuthExecutionResult<PollAuthResult>> {
    const flowResult = await requireFlow(input.profileId, input.providerId, input.flowId);
    if (flowResult.isErr()) {
        return errAuthExecution(flowResult.error.code, flowResult.error.message);
    }
    const flow = flowResult.value;
    const cancelledFlow = await providerAuthFlowStore.updateStatus(flow.id, {
        status: 'cancelled',
        consumedAt: nowIso(),
    });
    await providerAuthStore.upsert({
        profileId: input.profileId,
        providerId: input.providerId,
        authMethod: 'none',
        authState: 'logged_out',
    });

    return okAuthExecution({
        flow: cancelledFlow ?? flow,
        state: await getAuthState(input.profileId, input.providerId),
    });
}
