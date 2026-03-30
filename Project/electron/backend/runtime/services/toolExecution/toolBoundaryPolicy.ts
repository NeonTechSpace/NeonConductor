import type { ToolInvokeInput } from '@/app/backend/runtime/contracts';
import { buildBlockedToolOutcome, buildDeniedToolOutcome } from '@/app/backend/runtime/services/toolExecution/blocked';
import {
    boundaryDefaultPolicy,
    boundaryResource,
    resolveToolDecision,
} from '@/app/backend/runtime/services/toolExecution/decision';
import { isIgnoredWorkspacePath, isPathInsideWorkspace } from '@/app/backend/runtime/services/toolExecution/safety';
import type {
    ToolBoundaryDecisionResult,
    ToolRequestContext,
} from '@/app/backend/runtime/services/toolExecution/toolExecutionLifecycle.types';

export async function resolveToolBoundaryDecision(input: {
    request: ToolInvokeInput;
    context: ToolRequestContext;
    executionPreset: 'privacy' | 'standard' | 'yolo';
}): Promise<ToolBoundaryDecisionResult> {
    const { context, request } = input;
    const toolId = context.definition.tool.id;

    if (context.workspaceRequirement === 'detached_scope') {
        return buildDeniedToolOutcome({
            profileId: request.profileId,
            toolId,
            resource: boundaryResource(toolId, 'workspace_required'),
            policy: {
                effective: 'deny',
                source: 'detached_scope',
            },
            reason: 'detached_scope',
            message: `Tool "${toolId}" requires a workspace-bound thread. Detached chat has no file authority.`,
            args: context.args,
            at: context.at,
        });
    }

    if (context.workspaceRequirement === 'workspace_unresolved') {
        return buildDeniedToolOutcome({
            profileId: request.profileId,
            toolId,
            resource: boundaryResource(toolId, 'workspace_required'),
            policy: {
                effective: 'deny',
                source: 'workspace_unresolved',
            },
            reason: 'workspace_unresolved',
            message: `Tool "${toolId}" could not resolve the workspace root for this thread.`,
            args: context.args,
            at: context.at,
        });
    }

    if (!context.resolvedWorkspacePath || !context.workspaceLabel) {
        return null;
    }

    if (
        !context.definition.tool.allowsExternalPaths &&
        !isPathInsideWorkspace(
            context.resolvedWorkspacePath.absolutePath,
            context.resolvedWorkspacePath.workspaceRootPath
        )
    ) {
        const decision = await resolveToolDecision({
            profileId: request.profileId,
            topLevelTab: request.topLevelTab,
            modeKey: request.modeKey,
            executionPreset: input.executionPreset,
            capabilities: context.definition.tool.capabilities,
            ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
            resource: boundaryResource(toolId, 'outside_workspace'),
            scopeKind: 'boundary',
            toolDefaultPolicy: boundaryDefaultPolicy(input.executionPreset),
            summary: {
                title: 'Outside Workspace Access',
                detail: `${context.definition.tool.label} wants to access a path outside ${context.workspaceLabel}.`,
            },
            denyMessage: `Tool "${toolId}" cannot access paths outside the registered workspace root in the current safety preset.`,
            askMessage: `Tool "${toolId}" needs approval to access a path outside the registered workspace root.`,
            denyReason: 'outside_workspace',
        });

        if (decision.kind !== 'allow') {
            return buildBlockedToolOutcome({
                decision,
                profileId: request.profileId,
                toolId,
                args: context.args,
                at: context.at,
                ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
            });
        }
    }

    if (
        !context.definition.tool.allowsIgnoredPaths &&
        isIgnoredWorkspacePath(
            context.resolvedWorkspacePath.absolutePath,
            context.resolvedWorkspacePath.workspaceRootPath
        )
    ) {
        const decision = await resolveToolDecision({
            profileId: request.profileId,
            topLevelTab: request.topLevelTab,
            modeKey: request.modeKey,
            executionPreset: input.executionPreset,
            capabilities: context.definition.tool.capabilities,
            ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
            resource: boundaryResource(toolId, 'ignored_path'),
            scopeKind: 'boundary',
            toolDefaultPolicy: boundaryDefaultPolicy(input.executionPreset),
            summary: {
                title: 'Ignored Path Access',
                detail: `${context.definition.tool.label} wants to access an ignored path inside ${context.workspaceLabel}.`,
            },
            denyMessage: `Tool "${toolId}" cannot access ignored paths in the current safety preset.`,
            askMessage: `Tool "${toolId}" needs approval to access an ignored path.`,
            denyReason: 'ignored_path',
        });

        if (decision.kind !== 'allow') {
            return buildBlockedToolOutcome({
                decision,
                profileId: request.profileId,
                toolId,
                args: context.args,
                at: context.at,
                ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
            });
        }
    }

    return null;
}
