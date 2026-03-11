import { useState } from 'react';

import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

export function useKiloAccountSettingsController(profileId: string) {
    const utils = trpc.useUtils();
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

    const providersQuery = trpc.provider.listProviders.useQuery({ profileId }, PROGRESSIVE_QUERY_OPTIONS);
    const authStateQuery = trpc.provider.getAuthState.useQuery(
        {
            profileId,
            providerId: 'kilo',
        },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const accountContextQuery = trpc.provider.getAccountContext.useQuery(
        {
            profileId,
            providerId: 'kilo',
        },
        PROGRESSIVE_QUERY_OPTIONS
    );

    const setOrganizationMutation = trpc.provider.setOrganization.useMutation({
        onSuccess: (result) => {
            setStatusMessage('Kilo organization updated.');
            utils.provider.getAccountContext.setData(
                {
                    profileId,
                    providerId: 'kilo',
                },
                result
            );
            void utils.provider.listProviders.invalidate({ profileId });
            void utils.provider.getAuthState.invalidate({
                profileId,
                providerId: 'kilo',
            });
        },
    });

    return {
        provider: providersQuery.data?.providers.find((provider) => provider.id === 'kilo'),
        authState: authStateQuery.data?.state,
        accountContext: accountContextQuery.data?.providerId === 'kilo' ? accountContextQuery.data.kiloAccountContext : undefined,
        feedbackMessage: setOrganizationMutation.error?.message ?? statusMessage,
        feedbackTone: setOrganizationMutation.error ? ('error' as const) : statusMessage ? ('success' as const) : ('info' as const),
        isLoading: providersQuery.isLoading || accountContextQuery.isLoading,
        isSavingOrganization: setOrganizationMutation.isPending,
        changeOrganization: async (organizationId?: string) => {
            await setOrganizationMutation.mutateAsync({
                profileId,
                providerId: 'kilo',
                ...(organizationId ? { organizationId } : { organizationId: null }),
            });
        },
    };
}
