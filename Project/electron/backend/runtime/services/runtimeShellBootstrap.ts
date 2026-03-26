import { runtimeEventStore, tagStore, workspaceRootStore, sandboxStore } from '@/app/backend/persistence/stores';
import { providerManagementService } from '@/app/backend/providers/service';
import type { RuntimeShellBootstrap } from '@/app/backend/runtime/contracts';
import { getExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import { listWorkspacePreferences } from '@/app/backend/runtime/services/workspace/preferences';

export interface RuntimeShellBootstrapService {
    getShellBootstrap(profileId: string): Promise<RuntimeShellBootstrap>;
}

class RuntimeShellBootstrapServiceImpl implements RuntimeShellBootstrapService {
    async getShellBootstrap(profileId: string): Promise<RuntimeShellBootstrap> {
        const [
            lastSequence,
            providerControlResult,
            threadTags,
            executionPreset,
            workspaceRoots,
            workspacePreferences,
            sandboxes,
        ] = await Promise.all([
            runtimeEventStore.getLastSequence(),
            providerManagementService.getControlPlane(profileId),
            tagStore.listThreadTagsByProfile(profileId),
            getExecutionPreset(profileId),
            workspaceRootStore.listByProfile(profileId),
            listWorkspacePreferences(profileId),
            sandboxStore.listByProfile(profileId),
        ]);

        if (providerControlResult.isErr()) {
            throw new Error(providerControlResult.error.message);
        }

        return {
            lastSequence,
            providerControl: providerControlResult.value,
            threadTags,
            executionPreset,
            workspaceRoots,
            workspacePreferences,
            sandboxes,
        };
    }
}

export const runtimeShellBootstrapService: RuntimeShellBootstrapService = new RuntimeShellBootstrapServiceImpl();
