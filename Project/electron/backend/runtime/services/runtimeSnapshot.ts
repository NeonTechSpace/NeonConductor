import {
    accountSnapshotStore,
    conversationStore,
    diffStore,
    marketplaceStore,
    mcpStore,
    modeStore,
    permissionStore,
    providerAuthFlowStore,
    rulesetStore,
    runtimeEventStore,
    secretReferenceStore,
    sessionStore,
    skillfileStore,
    tagStore,
    toolStore,
} from '@/app/backend/persistence/stores';
import type { RuntimeSnapshotV1 } from '@/app/backend/persistence/types';
import { providerManagementService } from '@/app/backend/providers/service';

export interface RuntimeSnapshotService {
    getSnapshot(profileId: string): Promise<RuntimeSnapshotV1>;
}

class RuntimeSnapshotServiceImpl implements RuntimeSnapshotService {
    async getSnapshot(profileId: string): Promise<RuntimeSnapshotV1> {
        const [
            sessions,
            permissions,
            providers,
            providerModels,
            providerAuthStates,
            providerAuthFlows,
            providerDiscoverySnapshots,
            tools,
            mcpServers,
            defaults,
            lastSequence,
            conversations,
            threads,
            tags,
            threadTags,
            diffs,
            modeDefinitions,
            rulesets,
            skillfiles,
            marketplacePackages,
            kiloAccountContext,
            secretReferences,
        ] = await Promise.all([
            sessionStore.list(),
            permissionStore.listAll(),
            providerManagementService.listProviders(profileId),
            providerManagementService.listModelsByProfile(profileId),
            providerManagementService.listAuthStates(profileId),
            providerAuthFlowStore.listByProfile(profileId),
            providerManagementService.listDiscoverySnapshots(profileId),
            toolStore.list(),
            mcpStore.listServers(),
            providerManagementService.getDefaults(profileId),
            runtimeEventStore.getLastSequence(),
            conversationStore.listConversations(),
            conversationStore.listThreads(),
            tagStore.list(),
            tagStore.listThreadTags(),
            diffStore.list(),
            modeStore.listByProfile(profileId),
            rulesetStore.listByProfile(profileId),
            skillfileStore.listByProfile(profileId),
            marketplaceStore.listPackages(),
            accountSnapshotStore.getByProfile(profileId),
            secretReferenceStore.listByProfile(profileId),
        ]);

        return {
            generatedAt: new Date().toISOString(),
            lastSequence,
            sessions,
            permissions,
            providers,
            providerModels,
            providerAuthStates,
            providerAuthFlows,
            providerDiscoverySnapshots,
            tools,
            mcpServers,
            conversations,
            threads,
            tags,
            threadTags,
            diffs,
            modeDefinitions,
            rulesets,
            skillfiles,
            marketplacePackages,
            kiloAccountContext,
            secretReferences,
            defaults,
        };
    }
}

export const runtimeSnapshotService: RuntimeSnapshotService = new RuntimeSnapshotServiceImpl();
