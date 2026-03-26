import { useEffectEvent } from 'react';

import { setResolvedContextStateCache } from '@/web/components/context/contextStateCache';
import { applyConversationSessionCacheUpdate } from '@/web/components/conversation/shell/conversationShellCache';
import { setActivePlanCache } from '@/web/components/conversation/shell/planCache';
import type {
    ConversationPlanWorkspaceUpdateResult,
    ConversationQueries,
    ConversationSessionWorkspaceUpdate,
    TrpcUtils,
} from '@/web/components/conversation/shell/useConversationShellViewControllers.types';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';

import type { TopLevelTab } from '@/shared/contracts';
import type { ResolvedContextState, ResolvedContextStateInput } from '@/shared/contracts/types/context';



interface UseConversationShellCacheHandlersInput {
    utils: TrpcUtils;
    profileId: string;
    listThreadsInput: ConversationQueries['listThreadsInput'];
    selectedSessionId: string | undefined;
    topLevelTab: TopLevelTab;
}

export function useConversationShellCacheHandlers(input: UseConversationShellCacheHandlersInput) {
    const applySessionWorkspaceUpdate = useEffectEvent((sessionUpdate: ConversationSessionWorkspaceUpdate) => {
        if (!isEntityId(sessionUpdate.session.id, 'sess')) {
            return;
        }

        applyConversationSessionCacheUpdate({
            utils: input.utils,
            profileId: input.profileId,
            listThreadsInput: input.listThreadsInput,
            session: sessionUpdate.session,
            ...(sessionUpdate.run ? { run: sessionUpdate.run } : {}),
            ...(sessionUpdate.thread ? { thread: sessionUpdate.thread } : {}),
            ...(sessionUpdate.run && sessionUpdate.initialMessagesForRun
                ? {
                      initialMessagesForRun: {
                          runId: sessionUpdate.run.id,
                          messages: sessionUpdate.initialMessagesForRun.messages,
                          messageParts: sessionUpdate.initialMessagesForRun.messageParts,
                      },
                  }
                : {}),
        });
    });

    const applyPlanWorkspaceUpdate = useEffectEvent((planResult: ConversationPlanWorkspaceUpdateResult) => {
        if (!isEntityId(input.selectedSessionId, 'sess')) {
            return;
        }

        setActivePlanCache({
            utils: input.utils,
            profileId: input.profileId,
            sessionId: input.selectedSessionId,
            topLevelTab: input.topLevelTab,
            planResult,
        });
    });

    const cacheResolvedContextState = useEffectEvent(
        (queryInput: ResolvedContextStateInput, state: ResolvedContextState) => {
            setResolvedContextStateCache({
                utils: input.utils,
                queryInput,
                state,
            });
        }
    );

    return {
        applySessionWorkspaceUpdate,
        applyPlanWorkspaceUpdate,
        cacheResolvedContextState,
    };
}

