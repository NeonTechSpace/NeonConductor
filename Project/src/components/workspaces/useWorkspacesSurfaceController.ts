import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import {
    getProviderControlDefaults,
    listProviderControlModels,
    listProviderControlProviders,
} from '@/web/lib/providerControl/selectors';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

interface WorkspacesSurfaceControllerInput {
    profileId: string;
    workspaceRoots: Array<{
        fingerprint: string;
        label: string;
        absolutePath: string;
        updatedAt: string;
    }>;
    selectedWorkspaceFingerprint: string | undefined;
    onSelectedWorkspaceFingerprintChange: (workspaceFingerprint: string | undefined) => void;
    onCreateThreadForWorkspace: (workspaceFingerprint: string) => void;
}

export function useWorkspacesSurfaceController(input: WorkspacesSurfaceControllerInput) {
    const wrapFailClosedAction = <TArgs extends unknown[]>(action: (...args: TArgs) => Promise<void>) =>
        createFailClosedAsyncAction(action);
    const utils = trpc.useUtils();
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery(
        { profileId: input.profileId },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const sessionsQuery = trpc.session.list.useQuery({ profileId: input.profileId }, PROGRESSIVE_QUERY_OPTIONS);
    const threadsQuery = trpc.conversation.listThreads.useQuery(
        {
            profileId: input.profileId,
            activeTab: 'chat',
            showAllModes: true,
            groupView: 'workspace',
            sort: 'latest',
        },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const sandboxesQuery = trpc.sandbox.list.useQuery(
        {
            profileId: input.profileId,
            ...(input.selectedWorkspaceFingerprint ? { workspaceFingerprint: input.selectedWorkspaceFingerprint } : {}),
        },
        {
            enabled: Boolean(input.selectedWorkspaceFingerprint),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const registryQuery = trpc.registry.listResolved.useQuery(
        {
            profileId: input.profileId,
            ...(input.selectedWorkspaceFingerprint ? { workspaceFingerprint: input.selectedWorkspaceFingerprint } : {}),
        },
        {
            enabled: Boolean(input.selectedWorkspaceFingerprint),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const setWorkspacePreferenceMutation = trpc.runtime.setWorkspacePreference.useMutation({
        onSuccess: ({ workspacePreference }) => {
            utils.runtime.getShellBootstrap.setData({ profileId: input.profileId }, (current) =>
                current
                    ? {
                          ...current,
                          workspacePreferences: [
                              workspacePreference,
                              ...current.workspacePreferences.filter(
                                  (record) => record.workspaceFingerprint !== workspacePreference.workspaceFingerprint
                              ),
                          ],
                      }
                    : current
            );
        },
    });
    const registerWorkspaceRootMutation = trpc.runtime.registerWorkspaceRoot.useMutation();
    const deleteWorkspaceThreadsMutation = trpc.conversation.deleteWorkspaceThreads.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.conversation.listBuckets.invalidate({ profileId: input.profileId }),
                utils.conversation.listThreads.invalidate(),
                utils.session.list.invalidate({ profileId: input.profileId }),
            ]);
        },
    });
    const refreshRegistryMutation = trpc.registry.refresh.useMutation({
        onSuccess: async (_result, variables) => {
            await utils.registry.listResolved.invalidate({
                profileId: input.profileId,
                ...(variables.workspaceFingerprint ? { workspaceFingerprint: variables.workspaceFingerprint } : {}),
            });
        },
    });

    const providerControl = shellBootstrapQuery.data?.providerControl;
    const providers = listProviderControlProviders(providerControl);
    const providerModels = listProviderControlModels(providerControl);
    const workspacePreferences = shellBootstrapQuery.data?.workspacePreferences ?? [];
    const runtimeDefaults = getProviderControlDefaults(providerControl);
    const selectedWorkspace = input.selectedWorkspaceFingerprint
        ? input.workspaceRoots.find((workspaceRoot) => workspaceRoot.fingerprint === input.selectedWorkspaceFingerprint)
        : undefined;
    const selectedWorkspacePreference = input.selectedWorkspaceFingerprint
        ? workspacePreferences.find(
              (workspacePreference) => workspacePreference.workspaceFingerprint === input.selectedWorkspaceFingerprint
          )
        : undefined;
    const allThreads = threadsQuery.data?.threads ?? [];
    const allSessions = sessionsQuery.data?.sessions ?? [];
    const selectedWorkspaceThreads = input.selectedWorkspaceFingerprint
        ? allThreads.filter((thread) => thread.workspaceFingerprint === input.selectedWorkspaceFingerprint)
        : [];
    const selectedWorkspaceThreadIds = new Set(selectedWorkspaceThreads.map((thread) => thread.id));
    const selectedWorkspaceSessions = input.selectedWorkspaceFingerprint
        ? allSessions.filter((session) => selectedWorkspaceThreadIds.has(session.threadId))
        : [];

    return {
        providers,
        providerModels,
        runtimeDefaults,
        selectedWorkspace,
        selectedWorkspacePreference,
        selectedWorkspaceThreads,
        selectedWorkspaceSessions,
        selectedWorkspaceSandboxes: sandboxesQuery.data?.sandboxes ?? [],
        selectedWorkspaceRegistry: registryQuery.data,
        isCreatingWorkspace: registerWorkspaceRootMutation.isPending || setWorkspacePreferenceMutation.isPending,
        isRefreshingRegistry: refreshRegistryMutation.isPending,
        isDeletingWorkspaceConversations: deleteWorkspaceThreadsMutation.isPending,
        createWorkspace: async (createWorkspaceInput: {
            absolutePath: string;
            label: string;
            defaultTopLevelTab: TopLevelTab;
            defaultProviderId: RuntimeProviderId;
            defaultModelId: string;
        }) => {
            const result = await registerWorkspaceRootMutation.mutateAsync({
                profileId: input.profileId,
                absolutePath: createWorkspaceInput.absolutePath,
                label: createWorkspaceInput.label,
            });

            utils.runtime.listWorkspaceRoots.setData({ profileId: input.profileId }, (current) => ({
                workspaceRoots: current
                    ? [
                          result.workspaceRoot,
                          ...current.workspaceRoots.filter(
                              (workspaceRoot) => workspaceRoot.fingerprint !== result.workspaceRoot.fingerprint
                          ),
                      ]
                    : [result.workspaceRoot],
            }));
            utils.runtime.getShellBootstrap.setData({ profileId: input.profileId }, (current) =>
                current
                    ? {
                          ...current,
                          workspaceRoots: [
                              result.workspaceRoot,
                              ...current.workspaceRoots.filter(
                                  (workspaceRoot) => workspaceRoot.fingerprint !== result.workspaceRoot.fingerprint
                              ),
                          ],
                      }
                    : current
            );

            await setWorkspacePreferenceMutation.mutateAsync({
                profileId: input.profileId,
                workspaceFingerprint: result.workspaceRoot.fingerprint,
                defaultTopLevelTab: createWorkspaceInput.defaultTopLevelTab,
                defaultProviderId: createWorkspaceInput.defaultProviderId,
                defaultModelId: createWorkspaceInput.defaultModelId,
            });

            input.onSelectedWorkspaceFingerprintChange(result.workspaceRoot.fingerprint);
            input.onCreateThreadForWorkspace(result.workspaceRoot.fingerprint);
        },
        refreshRegistry: wrapFailClosedAction(async (workspaceFingerprint: string) => {
            await refreshRegistryMutation.mutateAsync({
                profileId: input.profileId,
                workspaceFingerprint,
            });
        }),
        deleteWorkspaceConversations: async (workspaceFingerprint: string) => {
            await deleteWorkspaceThreadsMutation.mutateAsync({
                profileId: input.profileId,
                workspaceFingerprint,
                includeFavorites: false,
            });
        },
    };
}
