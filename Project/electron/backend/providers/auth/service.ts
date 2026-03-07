import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import {
    getAccountContext,
    setOrganization as setOrganizationContext,
} from '@/app/backend/providers/auth/authAccountContextService';
import { clearAuth, getAuthState, setApiKey } from '@/app/backend/providers/auth/authStateService';
import { listProviderAuthMethods } from '@/app/backend/providers/auth/constants';
import { okAuthExecution, type AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import { logProviderAuthWarn, type LogContext } from '@/app/backend/providers/auth/logging';
import { runCheckedAuthOperation, runLoggedAuthOperation } from '@/app/backend/providers/auth/operations';
import { cancelAuthFlow, completeAuthFlow, pollAuthFlow } from '@/app/backend/providers/auth/pollAuthFlow';
import { runRefreshOperation } from '@/app/backend/providers/auth/refresh';
import { startAuthFlow } from '@/app/backend/providers/auth/startAuthFlow';
import type { PollAuthResult, ProviderAccountContextResult, StartAuthResult } from '@/app/backend/providers/auth/types';
import type { ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';

export class ProviderAuthExecutionService {
    private readonly refreshLocks = new Map<string, Promise<AuthExecutionResult<ProviderAuthStateRecord>>>();

    listAuthMethods(profileId: string): Array<{ providerId: RuntimeProviderId; methods: ProviderAuthMethod[] }> {
        void profileId;
        return listProviderAuthMethods();
    }

    getAuthState(profileId: string, providerId: RuntimeProviderId): Promise<ProviderAuthStateRecord> {
        return getAuthState(profileId, providerId);
    }

    async setApiKey(
        profileId: string,
        providerId: RuntimeProviderId,
        apiKey: string,
        context?: LogContext
    ): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
        return runLoggedAuthOperation({
            profileId,
            providerId,
            context,
            failureMessage: 'Failed to set provider API key.',
            execute: () => setApiKey(profileId, providerId, apiKey),
        });
    }

    async clearAuth(
        profileId: string,
        providerId: RuntimeProviderId,
        context?: LogContext
    ): Promise<AuthExecutionResult<{ cleared: boolean; authState: ProviderAuthStateRecord }>> {
        return runLoggedAuthOperation({
            profileId,
            providerId,
            context,
            failureMessage: 'Failed to clear provider auth.',
            execute: () => clearAuth(profileId, providerId),
        });
    }

    async startAuth(
        input: {
            profileId: string;
            providerId: RuntimeProviderId;
            method: ProviderAuthMethod;
        },
        context?: LogContext
    ): Promise<AuthExecutionResult<StartAuthResult>> {
        return runCheckedAuthOperation({
            profileId: input.profileId,
            providerId: input.providerId,
            context,
            failureMessage: 'Failed to start provider auth flow.',
            failureFields: { method: input.method },
            successMessage: 'Started provider auth flow.',
            successFields: { method: input.method },
            execute: () => startAuthFlow(input),
        });
    }

    async pollAuth(
        input: {
            profileId: string;
            providerId: RuntimeProviderId;
            flowId: string;
        },
        context?: LogContext
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        return runCheckedAuthOperation({
            profileId: input.profileId,
            providerId: input.providerId,
            context,
            failureMessage: 'Failed to poll provider auth flow.',
            failureFields: { flowId: input.flowId },
            execute: () => pollAuthFlow(input),
        });
    }

    async completeAuth(
        input: {
            profileId: string;
            providerId: RuntimeProviderId;
            flowId: string;
            code?: string;
        },
        context?: LogContext
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        return runCheckedAuthOperation({
            profileId: input.profileId,
            providerId: input.providerId,
            context,
            failureMessage: 'Failed to complete provider auth flow.',
            failureFields: { flowId: input.flowId },
            successMessage: 'Completed provider auth flow.',
            execute: () => completeAuthFlow(input),
        });
    }

    async cancelAuth(
        input: {
            profileId: string;
            providerId: RuntimeProviderId;
            flowId: string;
        },
        context?: LogContext
    ): Promise<AuthExecutionResult<PollAuthResult>> {
        return runCheckedAuthOperation({
            profileId: input.profileId,
            providerId: input.providerId,
            context,
            failureMessage: 'Failed to cancel provider auth flow.',
            failureFields: { flowId: input.flowId },
            successMessage: 'Cancelled provider auth flow.',
            successFields: { flowId: input.flowId },
            execute: () => cancelAuthFlow(input),
        });
    }

    async refreshAuth(
        profileId: string,
        providerId: RuntimeProviderId,
        context?: LogContext
    ): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
        const result = await runCheckedAuthOperation({
            profileId,
            providerId,
            context,
            failureMessage: 'Failed to refresh provider auth token.',
            successMessage: 'Refreshed provider auth token.',
            execute: () =>
                runRefreshOperation({
                    profileId,
                    providerId,
                    refreshLocks: this.refreshLocks,
                }),
        });

        if (result.isErr() && result.error.code === 'refresh_not_supported') {
            logProviderAuthWarn({
                message: result.error.message,
                fields: {
                    profileId,
                    providerId,
                    code: result.error.code,
                },
                context,
            });
        }

        return result;
    }

    async getAccountContext(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<AuthExecutionResult<ProviderAccountContextResult>> {
        return runCheckedAuthOperation({
            profileId,
            providerId,
            context: undefined,
            failureMessage: 'Failed to load provider account context.',
            execute: async () => okAuthExecution(await getAccountContext(profileId, providerId)),
        });
    }

    async setOrganization(
        profileId: string,
        providerId: 'kilo',
        organizationId?: string | null
    ): Promise<AuthExecutionResult<ProviderAccountContextResult>> {
        return runCheckedAuthOperation({
            profileId,
            providerId,
            context: undefined,
            failureMessage: 'Failed to set provider organization.',
            execute: async () => setOrganizationContext(profileId, providerId, organizationId),
        });
    }
}

export const providerAuthExecutionService = new ProviderAuthExecutionService();
