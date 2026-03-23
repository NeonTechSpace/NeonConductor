import { permissionPolicyOverrideStore } from '@/app/backend/persistence/stores';
import type { ExecutionPreset, PermissionPolicy, ToolCapability, TopLevelTab } from '@/app/backend/runtime/contracts';
import { modeAllowsToolCapabilities } from '@/app/backend/runtime/services/mode/toolCapabilities';
import { resolveModesForTab } from '@/app/backend/runtime/services/registry/service';

export interface ResolvedPermissionPolicy {
    policy: PermissionPolicy;
    source: 'mode' | 'workspace_override' | 'profile_override' | 'execution_preset' | 'tool_default';
    resource: string;
}

function extractToolIdFromResource(resource: string): string | null {
    if (resource.startsWith('mcp:')) {
        return 'mcp';
    }

    if (!resource.startsWith('tool:')) {
        return null;
    }

    const resourceBody = resource.slice('tool:'.length).trim();
    const toolId = resourceBody.split(':', 1)[0]?.trim() ?? '';
    return toolId.length > 0 ? toolId : null;
}

function isReadOnlyCapabilitySet(capabilities: ToolCapability[]): boolean {
    return capabilities.length > 0 && capabilities.every((capability) => capability === 'filesystem_read');
}

async function resolveModePolicy(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    resource: string;
    capabilities: ToolCapability[];
    workspaceFingerprint?: string;
}): Promise<PermissionPolicy | null> {
    const toolId = extractToolIdFromResource(input.resource);
    if (!toolId) {
        return null;
    }

    const modes = await resolveModesForTab({
        profileId: input.profileId,
        topLevelTab: input.topLevelTab,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    const mode = modes.find((candidate) => candidate.modeKey === input.modeKey);
    if (!mode || mode.executionPolicy.planningOnly) {
        return 'deny';
    }

    if (!modeAllowsToolCapabilities(mode, input.capabilities)) {
        return 'deny';
    }

    if (input.topLevelTab === 'agent' && input.modeKey === 'ask') {
        return isReadOnlyCapabilitySet(input.capabilities) ? 'allow' : 'deny';
    }

    return null;
}

function resolvePresetPolicy(input: {
    executionPreset: ExecutionPreset;
    toolDefaultPolicy: PermissionPolicy;
    capabilities: ToolCapability[];
}): PermissionPolicy {
    if (input.executionPreset === 'privacy') {
        return 'ask';
    }

    if (isReadOnlyCapabilitySet(input.capabilities)) {
        return 'allow';
    }

    return input.toolDefaultPolicy;
}

export async function resolveOverrideAndPresetPermissionPolicy(input: {
    profileId: string;
    resource: string;
    resourceCandidates?: string[];
    executionPreset: ExecutionPreset;
    capabilities: ToolCapability[];
    workspaceFingerprint?: string;
    toolDefaultPolicy: PermissionPolicy;
}): Promise<ResolvedPermissionPolicy> {
    const candidateResources =
        input.resourceCandidates && input.resourceCandidates.length > 0 ? input.resourceCandidates : [input.resource];

    if (input.workspaceFingerprint) {
        const scopeKey = permissionPolicyOverrideStore.toWorkspaceScopeKey(input.workspaceFingerprint);
        for (const resource of candidateResources) {
            const workspaceOverride = await permissionPolicyOverrideStore.get(input.profileId, scopeKey, resource);
            if (workspaceOverride) {
                return {
                    policy: workspaceOverride.policy,
                    source: 'workspace_override',
                    resource,
                };
            }
        }
    }

    for (const resource of candidateResources) {
        const profileOverride = await permissionPolicyOverrideStore.get(
            input.profileId,
            permissionPolicyOverrideStore.toProfileScopeKey(),
            resource
        );
        if (profileOverride) {
            return {
                policy: profileOverride.policy,
                source: 'profile_override',
                resource,
            };
        }
    }

    const presetPolicy = resolvePresetPolicy({
        executionPreset: input.executionPreset,
        toolDefaultPolicy: input.toolDefaultPolicy,
        capabilities: input.capabilities,
    });
    if (presetPolicy !== input.toolDefaultPolicy) {
        return {
            policy: presetPolicy,
            source: 'execution_preset',
            resource: input.resource,
        };
    }

    return {
        policy: input.toolDefaultPolicy,
        source: 'tool_default',
        resource: input.resource,
    };
}

export async function resolveEffectivePermissionPolicy(input: {
    profileId: string;
    resource: string;
    resourceCandidates?: string[];
    topLevelTab: TopLevelTab;
    modeKey: string;
    executionPreset: ExecutionPreset;
    capabilities: ToolCapability[];
    workspaceFingerprint?: string;
    toolDefaultPolicy: PermissionPolicy;
}): Promise<ResolvedPermissionPolicy> {
    const modePolicy = await resolveModePolicy({
        profileId: input.profileId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        resource: input.resource,
        capabilities: input.capabilities,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (modePolicy) {
        return {
            policy: modePolicy,
            source: 'mode',
            resource: input.resource,
        };
    }
    return resolveOverrideAndPresetPermissionPolicy({
        profileId: input.profileId,
        resource: input.resource,
        ...(input.resourceCandidates ? { resourceCandidates: input.resourceCandidates } : {}),
        executionPreset: input.executionPreset,
        capabilities: input.capabilities,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        toolDefaultPolicy: input.toolDefaultPolicy,
    });
}
