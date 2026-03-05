import {
    accountSnapshotStore,
    conversationStore,
    diffStore,
    marketplaceStore,
    messageStore,
    mcpStore,
    modeStore,
    permissionStore,
    profileStore,
    providerAuthFlowStore,
    rulesetStore,
    runStore,
    runUsageStore,
    runtimeEventStore,
    secretReferenceStore,
    sessionStore,
    skillfileStore,
    tagStore,
    threadStore,
    toolStore,
} from '@/app/backend/persistence/stores';
import type { RuntimeSnapshotV1 } from '@/app/backend/persistence/types';
import { providerManagementService } from '@/app/backend/providers/service';
import { appLog } from '@/app/main/logging';

export interface RuntimeSnapshotService {
    getSnapshot(profileId: string): Promise<RuntimeSnapshotV1>;
}

class RuntimeSnapshotServiceImpl implements RuntimeSnapshotService {
    async getSnapshot(profileId: string): Promise<RuntimeSnapshotV1> {
        const startedAt = Date.now();
        appLog.info({
            tag: 'runtime.snapshot',
            message: 'Building runtime snapshot.',
            profileId,
        });

        const loadSlice = async <T>(slice: string, loader: () => Promise<T>): Promise<T> => {
            try {
                return await loader();
            } catch (error) {
                appLog.error({
                    tag: 'runtime.snapshot',
                    message: 'Runtime snapshot slice load failed.',
                    profileId,
                    slice,
                    error: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        };

        const [
            profiles,
            activeProfile,
            sessions,
            runs,
            messages,
            messageParts,
            runUsage,
            providerUsageSummaries,
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
            loadSlice('profiles', () => profileStore.list()),
            loadSlice('active-profile', () => profileStore.getActive()),
            loadSlice('sessions', () => sessionStore.list(profileId)),
            loadSlice('runs', () => runStore.listByProfile(profileId)),
            loadSlice('messages', () => messageStore.listMessagesByProfile(profileId)),
            loadSlice('message-parts', () => messageStore.listPartsByProfile(profileId)),
            loadSlice('run-usage', () => runUsageStore.listByProfile(profileId)),
            loadSlice('provider-usage', () => runUsageStore.summarizeByProfile(profileId)),
            loadSlice('permissions', () => permissionStore.listAll()),
            loadSlice('providers', () => providerManagementService.listProviders(profileId)),
            loadSlice('provider-models', () => providerManagementService.listModelsByProfile(profileId)),
            loadSlice('provider-auth-states', () => providerManagementService.listAuthStates(profileId)),
            loadSlice('provider-auth-flows', () => providerAuthFlowStore.listByProfile(profileId)),
            loadSlice('provider-discovery-snapshots', () =>
                providerManagementService.listDiscoverySnapshots(profileId)
            ),
            loadSlice('tools', () => toolStore.list()),
            loadSlice('mcp-servers', () => mcpStore.listServers()),
            loadSlice('provider-defaults', () => providerManagementService.getDefaults(profileId)),
            loadSlice('runtime-last-sequence', () => runtimeEventStore.getLastSequence()),
            loadSlice('conversations', () => conversationStore.listBuckets(profileId)),
            loadSlice('threads', () =>
                threadStore.list({
                    profileId,
                    activeTab: 'chat',
                    showAllModes: true,
                    groupView: 'workspace',
                    sort: 'latest',
                })
            ),
            loadSlice('tags', () => tagStore.listByProfile(profileId)),
            loadSlice('thread-tags', () => tagStore.listThreadTagsByProfile(profileId)),
            loadSlice('diffs', () => diffStore.listByProfile(profileId)),
            loadSlice('mode-definitions', () => modeStore.listByProfile(profileId)),
            loadSlice('rulesets', () => rulesetStore.listByProfile(profileId)),
            loadSlice('skillfiles', () => skillfileStore.listByProfile(profileId)),
            loadSlice('marketplace-packages', () => marketplaceStore.listPackages()),
            loadSlice('kilo-account-context', () => accountSnapshotStore.getByProfile(profileId)),
            loadSlice('secret-references', () => secretReferenceStore.listByProfile(profileId)),
        ]);

        const snapshot: RuntimeSnapshotV1 = {
            generatedAt: new Date().toISOString(),
            lastSequence,
            profiles,
            activeProfileId: activeProfile.activeProfileId,
            sessions,
            runs,
            messages,
            messageParts,
            runUsage,
            providerUsageSummaries,
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

        appLog.info({
            tag: 'runtime.snapshot',
            message: 'Runtime snapshot built.',
            profileId,
            durationMs: Date.now() - startedAt,
            sessions: snapshot.sessions.length,
            runs: snapshot.runs.length,
            messages: snapshot.messages.length,
            providers: snapshot.providers.length,
            providerModels: snapshot.providerModels.length,
            profiles: snapshot.profiles.length,
            lastSequence: snapshot.lastSequence,
        });

        return snapshot;
    }
}

export const runtimeSnapshotService: RuntimeSnapshotService = new RuntimeSnapshotServiceImpl();
