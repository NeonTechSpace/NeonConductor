import { SessionWorkspacePanel } from '@/web/components/conversation/sessions/sessionWorkspacePanel';
import type { SessionWorkspacePanelProps } from '@/web/components/conversation/sessions/workspace/workspacePanelModel';
import { ConversationWorkspaceHeader } from '@/web/components/conversation/shell/composition/conversationWorkspaceHeader';

import type { ThreadListRecord } from '@/app/backend/persistence/types';

import type { TopLevelTab } from '@/shared/contracts';

interface ConversationWorkspaceSectionHeaderState {
    selectedThread: ThreadListRecord | undefined;
    streamState: string;
    streamErrorMessage?: string | null;
    lastSequence: number;
    tabSwitchNotice: string | undefined;
    topLevelTab: TopLevelTab;
    isSidebarCollapsed: boolean;
}

interface ConversationWorkspaceSectionProps {
    header: ConversationWorkspaceSectionHeaderState;
    panel: SessionWorkspacePanelProps;
    onToggleSidebar: () => void;
    onTopLevelTabChange: (topLevelTab: TopLevelTab) => void;
}

export function ConversationWorkspaceSection({
    header,
    panel,
    onToggleSidebar,
    onTopLevelTabChange,
}: ConversationWorkspaceSectionProps) {
    return (
        <section className='flex min-h-0 min-w-0 flex-1 flex-col'>
            <ConversationWorkspaceHeader
                {...(header.selectedThread?.title ? { threadTitle: header.selectedThread.title } : {})}
                streamState={header.streamState}
                {...(header.streamErrorMessage !== undefined ? { streamErrorMessage: header.streamErrorMessage } : {})}
                lastSequence={header.lastSequence}
                {...(header.tabSwitchNotice ? { tabSwitchNotice: header.tabSwitchNotice } : {})}
                topLevelTab={header.topLevelTab}
                isSidebarCollapsed={header.isSidebarCollapsed}
                onToggleSidebar={onToggleSidebar}
                onTopLevelTabChange={onTopLevelTabChange}
            />
            <SessionWorkspacePanel {...panel} />
        </section>
    );
}
