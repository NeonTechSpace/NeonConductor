import { useDeferredValue, useState } from 'react';

import { patchRegistryRefreshCaches } from '@/web/components/settings/registrySettings/registryRefreshCache';
import { filterResolvedSkillfiles } from '@/web/components/settings/registrySettings/registrySkillSearch';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

export function useRegistrySettingsController(profileId: string) {
    const utils = trpc.useUtils();
    const [selectedWorkspaceFingerprint, setSelectedWorkspaceFingerprint] = useState<string | undefined>(undefined);
    const [skillQuery, setSkillQuery] = useState('');
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | 'info'>('info');

    const workspaceRootsQuery = trpc.runtime.listWorkspaceRoots.useQuery({ profileId }, PROGRESSIVE_QUERY_OPTIONS);
    const workspaceRoots = workspaceRootsQuery.data?.workspaceRoots ?? [];
    const resolvedSelectedWorkspaceFingerprint =
        selectedWorkspaceFingerprint &&
        workspaceRoots.some((workspaceRoot) => workspaceRoot.fingerprint === selectedWorkspaceFingerprint)
            ? selectedWorkspaceFingerprint
            : undefined;
    const registryQuery = trpc.registry.listResolved.useQuery(
        {
            profileId,
            ...(resolvedSelectedWorkspaceFingerprint
                ? { workspaceFingerprint: resolvedSelectedWorkspaceFingerprint }
                : {}),
        },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const deferredSkillQuery = useDeferredValue(skillQuery.trim());
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

    const resolvedAgentModes = registryQuery.data?.resolved.modes.filter((mode) => mode.topLevelTab === 'agent') ?? [];
    const selectedWorkspaceRoot = resolvedSelectedWorkspaceFingerprint
        ? workspaceRoots.find((workspaceRoot) => workspaceRoot.fingerprint === resolvedSelectedWorkspaceFingerprint)
        : undefined;
    const skillMatches = filterResolvedSkillfiles(registryQuery.data?.resolved.skillfiles ?? [], deferredSkillQuery);

    return {
        selectedWorkspaceFingerprint: resolvedSelectedWorkspaceFingerprint,
        setSelectedWorkspaceFingerprint,
        skillQuery,
        setSkillQuery,
        workspaceRoots,
        registryQuery,
        refreshMutation,
        resolvedAgentModes,
        selectedWorkspaceRoot,
        skillMatches,
        feedbackMessage,
        feedbackTone,
    };
}
