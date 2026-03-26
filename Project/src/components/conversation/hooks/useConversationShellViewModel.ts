import type { WorkspaceExecutionScope } from '@/web/components/conversation/shell/deriveConversationWorkspaceExecutionScope';
import { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import type { useConversationShellSelectionState } from '@/web/components/conversation/shell/useConversationShellSelectionState';
import type { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/shared/contracts';

export function useConversationShellViewModel(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    queries: ReturnType<typeof useConversationQueries>;
    selectionState: ReturnType<typeof useConversationShellSelectionState>;
    runTargetState: ReturnType<typeof useConversationRunTarget>;
    workspaceScope: WorkspaceExecutionScope;
}) {
    const selectedThread = input.selectionState.selectedThread;
    const effectiveSelectedSandboxId =
        input.workspaceScope.kind === 'sandbox' ? input.workspaceScope.sandboxId : undefined;
    const registryResolvedQuery = trpc.registry.listResolved.useQuery(
        {
            profileId: input.profileId,
            ...(selectedThread?.workspaceFingerprint
                ? { workspaceFingerprint: selectedThread.workspaceFingerprint }
                : {}),
            ...(effectiveSelectedSandboxId ? { sandboxId: effectiveSelectedSandboxId } : {}),
        },
        {
            enabled: input.topLevelTab !== 'chat',
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const pendingPermissions =
        input.queries.pendingPermissionsQuery.data?.requests.filter(
            (request) => request.profileId === input.profileId
        ) ?? [];
    const permissionWorkspaces = Object.fromEntries(
        (input.queries.shellBootstrapQuery.data?.workspaceRoots ?? []).map((workspaceRoot) => [
            workspaceRoot.fingerprint,
            { label: workspaceRoot.label, absolutePath: workspaceRoot.absolutePath },
        ])
    );
    const visibleManagedSandboxes = selectedThread?.workspaceFingerprint
        ? (input.queries.shellBootstrapQuery.data?.sandboxes ?? []).filter(
              (sandbox) => sandbox.workspaceFingerprint === selectedThread.workspaceFingerprint
          )
        : [];
    const selectedProviderStatus = input.runTargetState.selectedProviderIdForComposer
        ? input.runTargetState.providerById.get(input.runTargetState.selectedProviderIdForComposer)
        : undefined;
    const selectedModelLabel =
        input.runTargetState.selectedProviderIdForComposer && input.runTargetState.selectedModelIdForComposer
            ? input.runTargetState.modelsByProvider
                  .get(input.runTargetState.selectedProviderIdForComposer)
                  ?.find((model) => model.id === input.runTargetState.selectedModelIdForComposer)?.label
            : undefined;
    const selectedUsageSummary = input.queries.usageSummaryQuery.data?.summaries.find(
        (summary) => summary.providerId === input.runTargetState.selectedProviderIdForComposer
    );
    const attachedRules = input.queries.attachedRulesQuery.data?.rulesets ?? [];
    const missingAttachedRuleKeys = input.queries.attachedRulesQuery.data?.missingAssetKeys ?? [];
    const attachedSkills = input.queries.attachedSkillsQuery.data?.skillfiles ?? [];
    const missingAttachedSkillKeys = input.queries.attachedSkillsQuery.data?.missingAssetKeys ?? [];
    const activeModeLabel =
        registryResolvedQuery.data?.resolved.modes.find(
            (resolvedMode) => resolvedMode.topLevelTab === input.topLevelTab && resolvedMode.modeKey === input.modeKey
        )?.label ?? input.modeKey;

    return {
        selectedThread,
        registryResolvedQuery,
        pendingPermissions,
        permissionWorkspaces,
        visibleManagedSandboxes,
        sessionRunSelection: input.selectionState.sessionRunSelection,
        effectiveSelectedSandboxId,
        selectedProviderStatus,
        selectedModelLabel,
        selectedUsageSummary,
        attachedRules,
        missingAttachedRuleKeys,
        attachedSkills,
        missingAttachedSkillKeys,
        activeModeLabel,
        workspaceScope: input.workspaceScope,
    };
}
