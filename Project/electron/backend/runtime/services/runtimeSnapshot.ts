import {
    accountSnapshotStore,
    checkpointStore,
    conversationStore,
    diffStore,
    marketplaceStore,
    messageStore,
    mcpStore,
    modeStore,
    permissionStore,
    profileStore,
    providerSecretStore,
    providerAuthFlowStore,
    rulesetStore,
    runStore,
    runUsageStore,
    runtimeEventStore,
    sessionStore,
    skillfileStore,
    tagStore,
    threadStore,
    toolStore,
    sandboxStore,
    workspaceRootStore,
} from '@/app/backend/persistence/stores';
import type { RuntimeSnapshotV1 } from '@/app/backend/persistence/types';
import { providerManagementService } from '@/app/backend/providers/service';
import {
    errOp,
    okOp,
    toOperationalError,
    type OperationalResult,
} from '@/app/backend/runtime/services/common/operationalError';
import { getExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import { appLog } from '@/app/main/logging';

export interface RuntimeSnapshotService {
    getSnapshot(profileId: string): Promise<OperationalResult<RuntimeSnapshotV1>>;
}

class RuntimeSnapshotServiceImpl implements RuntimeSnapshotService {
    async getSnapshot(profileId: string): Promise<OperationalResult<RuntimeSnapshotV1>> {
        // Diagnostic-only whole-runtime snapshot. Renderer app paths should stay on scoped contracts.
        const startedAt = Date.now();
        appLog.info({
            tag: 'runtime.snapshot',
            message: 'Building runtime snapshot.',
            profileId,
        });

        try {
            const activeProfileResult = await profileStore.getActive();
            if (activeProfileResult.isErr()) {
                appLog.error({
                    tag: 'runtime.snapshot',
                    message: 'Runtime snapshot build failed.',
                    profileId,
                    durationMs: Date.now() - startedAt,
                    error: activeProfileResult.error.message,
                    code: 'not_found',
                });
                return errOp('not_found', activeProfileResult.error.message);
            }

            const [
                profiles,
                sessions,
                runs,
                messages,
                messageParts,
                runUsage,
                providerUsageSummaries,
                permissions,
                executionPreset,
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
                workspaceRoots,
                sandboxes,
                threads,
                tags,
                threadTags,
                diffs,
                checkpoints,
                modeDefinitions,
                rulesets,
                skillfiles,
                marketplacePackages,
                kiloAccountContext,
                providerSecrets,
            ] = await Promise.all([
                profileStore.list(),
                sessionStore.list(profileId),
                runStore.listByProfile(profileId),
                messageStore.listMessagesByProfile(profileId),
                messageStore.listPartsByProfile(profileId),
                runUsageStore.listByProfile(profileId),
                runUsageStore.summarizeByProfile(profileId),
                permissionStore.listAll(),
                getExecutionPreset(profileId),
                providerManagementService.listProviders(profileId),
                providerManagementService.listModelsByProfile(profileId),
                providerManagementService.listAuthStates(profileId),
                providerAuthFlowStore.listByProfile(profileId),
                providerManagementService.listDiscoverySnapshots(profileId),
                toolStore.list(),
                mcpStore.listServers(),
                providerManagementService.getDefaults(profileId),
                runtimeEventStore.getLastSequence(),
                conversationStore.listBuckets(profileId),
                workspaceRootStore.listByProfile(profileId),
                sandboxStore.listByProfile(profileId),
                threadStore.list({
                    profileId,
                    activeTab: 'chat',
                    showAllModes: true,
                    groupView: 'workspace',
                    sort: 'latest',
                }),
                tagStore.listByProfile(profileId),
                tagStore.listThreadTagsByProfile(profileId),
                diffStore.listByProfile(profileId),
                checkpointStore.listByProfile(profileId),
                modeStore.listByProfile(profileId),
                rulesetStore.listByProfile(profileId),
                skillfileStore.listByProfile(profileId),
                marketplaceStore.listPackages(),
                accountSnapshotStore.getByProfile(profileId),
                providerSecretStore.listByProfile(profileId),
            ]);

            const snapshot: RuntimeSnapshotV1 = {
                generatedAt: new Date().toISOString(),
                lastSequence,
                profiles,
                activeProfileId: activeProfileResult.value.activeProfileId,
                sessions,
                runs,
                messages,
                messageParts,
                runUsage,
                providerUsageSummaries,
                permissions,
                executionPreset,
                providers,
                providerModels,
                providerAuthStates,
                providerAuthFlows,
                providerDiscoverySnapshots,
                tools,
                mcpServers,
                conversations,
                workspaceRoots,
                sandboxes,
                threads,
                tags,
                threadTags,
                diffs,
                checkpoints,
                modeDefinitions,
                rulesets,
                skillfiles,
                marketplacePackages,
                kiloAccountContext,
                providerSecrets,
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

            return okOp(snapshot);
        } catch (error) {
            const operationalError = toOperationalError(error, 'request_failed', 'Failed to build runtime snapshot.');
            appLog.error({
                tag: 'runtime.snapshot',
                message: 'Runtime snapshot build failed.',
                profileId,
                durationMs: Date.now() - startedAt,
                error: operationalError.message,
                code: operationalError.code,
            });
            return errOp(operationalError.code, operationalError.message, {
                ...(operationalError.details ? { details: operationalError.details } : {}),
                ...(operationalError.retryable !== undefined ? { retryable: operationalError.retryable } : {}),
            });
        }
    }
}

export const runtimeSnapshotService: RuntimeSnapshotService = new RuntimeSnapshotServiceImpl();
