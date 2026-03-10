import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/shared';
import { addInvalidation, hasPayloadKey, invalidateShellBootstrap } from '@/web/lib/runtime/invalidation/shared';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

function isProviderCatalogEvent(event: RuntimeEventRecordV1): boolean {
    return event.operation === 'sync' || hasPayloadKey(event, 'modelCount');
}

function isProviderRoutingEvent(event: RuntimeEventRecordV1, context: RuntimeEventContext): boolean {
    return context.providerId === 'kilo' && Boolean(context.modelId) && hasPayloadKey(event, 'routingMode');
}

function isProviderDefaultEvent(event: RuntimeEventRecordV1, context: RuntimeEventContext): boolean {
    return Boolean(
        context.providerId &&
            context.modelId &&
            event.operation === 'upsert' &&
            !hasPayloadKey(event, 'routingMode') &&
            !hasPayloadKey(event, 'flowId')
    );
}

function isProviderEndpointProfileEvent(event: RuntimeEventRecordV1): boolean {
    return hasPayloadKey(event, 'value');
}

function isProviderAccountContextEvent(event: RuntimeEventRecordV1): boolean {
    return hasPayloadKey(event, 'organizationId') || hasPayloadKey(event, 'accountId');
}

function isProviderAuthEvent(event: RuntimeEventRecordV1): boolean {
    return hasPayloadKey(event, 'authState') || hasPayloadKey(event, 'flowId') || event.operation === 'status';
}

export async function invalidateProviderQueries(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1,
    context: RuntimeEventContext
): Promise<void> {
    const invalidations: Promise<void>[] = [];

    if (context.profileId && context.providerId && isProviderAuthEvent(event)) {
        addInvalidation(
            invalidations,
            utils.provider.getAuthState.invalidate({
                profileId: context.profileId,
                providerId: context.providerId,
            })
        );
    } else if (isProviderAuthEvent(event)) {
        addInvalidation(invalidations, utils.provider.getAuthState.invalidate());
    }

    if (isProviderAccountContextEvent(event)) {
        addInvalidation(
            invalidations,
            context.profileId && context.providerId
                ? utils.provider.getAccountContext.invalidate({
                      profileId: context.profileId,
                      providerId: context.providerId,
                  })
                : utils.provider.getAccountContext.invalidate()
        );
    }

    if (isProviderEndpointProfileEvent(event)) {
        addInvalidation(
            invalidations,
            context.profileId && context.providerId
                ? utils.provider.getEndpointProfile.invalidate({
                      profileId: context.profileId,
                      providerId: context.providerId,
                  })
                : utils.provider.getEndpointProfile.invalidate()
        );
    }

    if (isProviderCatalogEvent(event)) {
        addInvalidation(
            invalidations,
            context.profileId && context.providerId
                ? utils.provider.listModels.invalidate({
                      profileId: context.profileId,
                      providerId: context.providerId,
                  })
                : utils.provider.listModels.invalidate()
        );
        addInvalidation(
            invalidations,
            context.profileId
                ? utils.provider.listModelProviders.invalidate({ profileId: context.profileId })
                : utils.provider.listModelProviders.invalidate()
        );
        addInvalidation(invalidations, invalidateShellBootstrap(utils, context.profileId));
    }

    if (isProviderDefaultEvent(event, context)) {
        addInvalidation(
            invalidations,
            context.profileId
                ? utils.provider.getDefaults.invalidate({ profileId: context.profileId })
                : utils.provider.getDefaults.invalidate()
        );
        addInvalidation(invalidations, invalidateShellBootstrap(utils, context.profileId));
    }

    if (isProviderRoutingEvent(event, context)) {
        addInvalidation(
            invalidations,
            context.profileId && context.modelId
                ? utils.provider.getModelRoutingPreference.invalidate({
                      profileId: context.profileId,
                      providerId: 'kilo',
                      modelId: context.modelId,
                  })
                : utils.provider.getModelRoutingPreference.invalidate()
        );
    }

    await Promise.all(invalidations);
}
