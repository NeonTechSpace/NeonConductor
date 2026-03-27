import { useState } from 'react';

import { patchRegistryRefreshCaches } from '@/web/components/settings/registrySettings/registryRefreshCache';
import { trpc } from '@/web/trpc/client';

export function useRegistryRefreshController(profileId: string) {
    const utils = trpc.useUtils();
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | 'info'>('info');

    const refreshMutation = trpc.registry.refresh.useMutation({
        onSuccess: (result, variables) => {
            setFeedbackTone('success');
            setFeedbackMessage(
                variables.workspaceFingerprint
                    ? 'Refreshed registry data for the selected workspace.'
                    : 'Refreshed global registry data.'
            );
            patchRegistryRefreshCaches({
                utils,
                profileId,
                ...(variables.workspaceFingerprint ? { workspaceFingerprint: variables.workspaceFingerprint } : {}),
                refreshResult: result,
            });
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    return {
        refreshMutation,
        feedbackMessage,
        feedbackTone,
    };
}
