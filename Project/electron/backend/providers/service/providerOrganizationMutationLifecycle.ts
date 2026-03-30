import { errAuthExecution, type AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import type { ProviderAccountContextResult } from '@/app/backend/providers/auth/types';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import {
    applyProviderCatalogInvalidationDecision,
    providerCatalogInvalidationActions,
    providerCatalogInvalidationPolicy,
} from '@/app/backend/providers/service/providerCatalogInvalidationPolicy';
import { providerProfileNormalizationGate } from '@/app/backend/providers/service/providerProfileNormalizationGate';
import type {
    ProviderMutationContext,
    ProviderOrganizationMutationResult,
} from '@/app/backend/providers/service/providerMutationLifecycle.types';

export function createProviderOrganizationMutationLifecycle(input = {
    ensureNormalizedProviderProfileState: providerProfileNormalizationGate.ensureNormalized.bind(
        providerProfileNormalizationGate
    ),
    setOrganization: providerAuthExecutionService.setOrganization.bind(providerAuthExecutionService),
    catalogInvalidationPolicy: providerCatalogInvalidationPolicy,
    catalogInvalidationActions: providerCatalogInvalidationActions,
}) {
    return {
        async setOrganization(
            profileId: string,
            providerId: 'kilo',
            organizationId?: string | null,
            _context?: ProviderMutationContext
        ): Promise<AuthExecutionResult<ProviderOrganizationMutationResult>> {
            await input.ensureNormalizedProviderProfileState(profileId);
            const result = await input.setOrganization(profileId, providerId, organizationId);
            if (result.isOk()) {
                await applyProviderCatalogInvalidationDecision(
                    input.catalogInvalidationActions,
                    input.catalogInvalidationPolicy.resolveOrganizationMutation(profileId, providerId)
                );
            }

            if (result.isErr()) {
                return errAuthExecution(result.error.code, result.error.message);
            }

            return result.map((accountContext: ProviderAccountContextResult) => ({
                accountContext,
            }));
        },
    };
}

export const providerOrganizationMutationLifecycle = createProviderOrganizationMutationLifecycle();

export const { setOrganization: setProviderOrganization } = providerOrganizationMutationLifecycle;
