import { useConversationShellViewModel } from '@/web/components/conversation/hooks/useConversationShellViewModel';
import { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';

import type { TopLevelTab } from '@/shared/contracts';

interface BuildConversationWorkspaceSectionStateInput {
    topLevelTab: TopLevelTab;
    modeKey: string;
    shellViewModel: ReturnType<typeof useConversationShellViewModel>;
    queries: ReturnType<typeof useConversationQueries>;
    runTargetState: ReturnType<typeof useConversationRunTarget>;
}

export function buildConversationWorkspaceSectionState(input: BuildConversationWorkspaceSectionStateInput) {
    return {
        ...(input.runTargetState.selectedProviderIdForComposer && input.shellViewModel.selectedProviderStatus
            ? {
                  selectedProviderStatus: {
                      label: input.shellViewModel.selectedProviderStatus.label,
                      authState: input.shellViewModel.selectedProviderStatus.authState,
                      authMethod: input.shellViewModel.selectedProviderStatus.authMethod,
                  },
              }
            : {}),
        ...(input.shellViewModel.selectedModelLabel
            ? { selectedModelLabel: input.shellViewModel.selectedModelLabel }
            : {}),
        ...(input.shellViewModel.selectedUsageSummary
            ? { selectedUsageSummary: input.shellViewModel.selectedUsageSummary }
            : {}),
        ...(input.topLevelTab === 'agent' && input.shellViewModel.registryResolvedQuery.data
            ? {
                  registrySummary: {
                      modes: input.shellViewModel.registryResolvedQuery.data.resolved.modes.filter(
                          (resolvedMode) => resolvedMode.topLevelTab === 'agent'
                      ).length,
                      rulesets: input.shellViewModel.registryResolvedQuery.data.resolved.rulesets.length,
                      skillfiles: input.shellViewModel.registryResolvedQuery.data.resolved.skillfiles.length,
                  },
              }
            : {}),
        ...(input.topLevelTab === 'agent' && input.shellViewModel.activeModeLabel
            ? {
                  agentContextSummary: {
                      modeLabel: input.shellViewModel.activeModeLabel,
                      rulesetCount: input.shellViewModel.registryResolvedQuery.data?.resolved.rulesets.length ?? 0,
                      attachedRuleCount: input.shellViewModel.attachedRules.length,
                      attachedSkillCount: input.shellViewModel.attachedSkills.length,
                  },
              }
            : {}),
        ...(input.queries.runDiffsQuery.data?.overview
            ? { runDiffOverview: input.queries.runDiffsQuery.data.overview }
            : {}),
    };
}
