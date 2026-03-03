import { getDefaultProfileId } from '@/app/backend/persistence/db';
import {
    conversationStore,
    diffStore,
    mcpStore,
    permissionStore,
    providerStore,
    runtimeEventStore,
    sessionStore,
    tagStore,
    toolStore,
} from '@/app/backend/persistence/stores';
import type { RuntimeSnapshotV1 } from '@/app/backend/persistence/types';

export interface RuntimeSnapshotService {
    getSnapshot(): Promise<RuntimeSnapshotV1>;
}

class RuntimeSnapshotServiceImpl implements RuntimeSnapshotService {
    async getSnapshot(): Promise<RuntimeSnapshotV1> {
        const [
            sessions,
            permissions,
            providers,
            providerModels,
            tools,
            mcpServers,
            defaults,
            lastSequence,
            conversations,
            threads,
            tags,
            threadTags,
            diffs,
        ] = await Promise.all([
            sessionStore.list(),
            permissionStore.listAll(),
            providerStore.listProviders(),
            providerStore.listModels(),
            toolStore.list(),
            mcpStore.listServers(),
            providerStore.getDefaults(getDefaultProfileId()),
            runtimeEventStore.getLastSequence(),
            conversationStore.listConversations(),
            conversationStore.listThreads(),
            tagStore.list(),
            tagStore.listThreadTags(),
            diffStore.list(),
        ]);

        return {
            generatedAt: new Date().toISOString(),
            lastSequence,
            sessions,
            permissions,
            providers: providers.map((provider) => ({
                ...provider,
                isDefault: provider.id === defaults.providerId,
            })),
            providerModels,
            tools,
            mcpServers,
            conversations,
            threads,
            tags,
            threadTags,
            diffs,
            defaults,
        };
    }
}

export const runtimeSnapshotService: RuntimeSnapshotService = new RuntimeSnapshotServiceImpl();
