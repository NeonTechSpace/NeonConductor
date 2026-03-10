import { useEffect } from 'react';

import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';

export function useProviderSettingsAuthPolling(input: {
    profileId: string;
    activeAuthFlow: ActiveAuthFlow | undefined;
    isPolling: boolean;
    pollAuth: (payload: { profileId: string; providerId: ActiveAuthFlow['providerId']; flowId: string }) => Promise<void>;
}) {
    useEffect(() => {
        if (!input.activeAuthFlow || input.isPolling) {
            return;
        }

        const activeAuthFlow = input.activeAuthFlow;
        const timer = window.setTimeout(
            () => {
                void input.pollAuth({
                    profileId: input.profileId,
                    providerId: activeAuthFlow.providerId,
                    flowId: activeAuthFlow.flowId,
                });
            },
            Math.max(1, activeAuthFlow.pollAfterSeconds) * 1000
        );

        return () => {
            window.clearTimeout(timer);
        };
    }, [input.activeAuthFlow, input.isPolling, input.pollAuth, input.profileId]);
}
