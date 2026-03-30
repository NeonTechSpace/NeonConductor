import {
    getProviderControlDefaults,
    listProviderControlModels,
    listProviderControlProviders,
} from '@/web/lib/providerControl/selectors';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

interface WorkspacesSurfaceReadModelInput {
    profileId: string;
    workspaceRoots: Array<{
        fingerprint: string;
        label: string;
        absolutePath: string;
        updatedAt: string;
    }>;
    selectedWorkspaceFingerprint: string | undefined;
}

export function useWorkspacesSurfaceReadModel(input: WorkspacesSurfaceReadModelInput) {
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
    };
}
