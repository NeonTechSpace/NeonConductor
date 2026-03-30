import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import { getProviderDefinition } from '@/app/backend/providers/registry';
import { syncCatalog } from '@/app/backend/providers/service/catalogSync';
import {
    applyProviderCatalogInvalidationDecision,
    providerCatalogInvalidationActions,
    providerCatalogInvalidationPolicy,
} from '@/app/backend/providers/service/providerCatalogInvalidationPolicy';
import { providerDefaultModelRepairService } from '@/app/backend/providers/service/providerDefaultModelRepairService';
import { setConnectionProfileState } from '@/app/backend/providers/service/endpointProfiles';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import { providerProfileNormalizationGate } from '@/app/backend/providers/service/providerProfileNormalizationGate';
import type {
    ProviderConnectionProfileMutationResult,
    ProviderMutationContext,
} from '@/app/backend/providers/service/providerMutationLifecycle.types';
import type { ProviderConnectionProfileResult } from '@/app/backend/providers/service/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export function createProviderConnectionProfileMutationLifecycle(input = {
    ensureNormalizedProviderProfileState: providerProfileNormalizationGate.ensureNormalized.bind(
        providerProfileNormalizationGate
    ),
    getProviderDefinition,
    setConnectionProfileState,
    setOrganization: providerAuthExecutionService.setOrganization.bind(providerAuthExecutionService),
    catalogInvalidationPolicy: providerCatalogInvalidationPolicy,
    catalogInvalidationActions: providerCatalogInvalidationActions,
    syncCatalog,
    defaultModelRepairService: providerDefaultModelRepairService,
    getAuthState: providerAuthExecutionService.getAuthState.bind(providerAuthExecutionService),
}) {
    return {
        async setConnectionProfile(
            profileId: string,
            providerId: RuntimeProviderId,
            inputValue: {
                optionProfileId: string;
                baseUrlOverride?: string | null;
                organizationId?: string | null;
            },
            context?: ProviderMutationContext
        ): Promise<ProviderServiceResult<ProviderConnectionProfileMutationResult>> {
            await input.ensureNormalizedProviderProfileState(profileId);

            const providerDefinition = input.getProviderDefinition(providerId);
            if (inputValue.organizationId !== undefined && !providerDefinition.supportsOrganizationScope) {
                return errProviderService(
                    'invalid_payload',
                    `Provider "${providerId}" does not support organization-scoped connection profiles.`
                );
            }

            const stateResult = await input.setConnectionProfileState(profileId, providerId, {
                optionProfileId: inputValue.optionProfileId,
                ...(inputValue.baseUrlOverride !== undefined ? { baseUrlOverride: inputValue.baseUrlOverride } : {}),
            });
            if (stateResult.isErr()) {
                return errProviderService(stateResult.error.code, stateResult.error.message);
            }

            if (providerId === 'kilo' && inputValue.organizationId !== undefined) {
                const organizationResult = await input.setOrganization(profileId, providerId, inputValue.organizationId);
                if (organizationResult.isErr()) {
                    return errProviderService('invalid_payload', organizationResult.error.message);
                }
            }

            await applyProviderCatalogInvalidationDecision(
                input.catalogInvalidationActions,
                input.catalogInvalidationPolicy.resolveConnectionProfileMutation(profileId, providerId)
            );

            const syncResult = await input.syncCatalog(profileId, providerId, true, context);
            if (syncResult.isErr()) {
                return errProviderService(syncResult.error.code, syncResult.error.message);
            }

            await input.defaultModelRepairService.repairDefaultModelIfMissing(profileId, providerId);

            const authState = await input.getAuthState(profileId, providerId);
            const connectionProfile: ProviderConnectionProfileResult = authState.organizationId
                ? {
                      ...stateResult.value,
                      organizationId: authState.organizationId,
                  }
                : stateResult.value;
            return okProviderService({
                connectionProfile,
            });
        },
    };
}

export const providerConnectionProfileMutationLifecycle = createProviderConnectionProfileMutationLifecycle();

export const { setConnectionProfile: setProviderConnectionProfile } = providerConnectionProfileMutationLifecycle;
