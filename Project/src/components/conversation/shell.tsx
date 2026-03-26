import { useState } from 'react';

import { BranchWorkflowDialog } from '@/web/components/conversation/panels/branchWorkflowDialog';
import { MessageEditDialog } from '@/web/components/conversation/panels/messageEditDialog';
import { ConversationWorkspaceSection } from '@/web/components/conversation/shell/composition/conversationWorkspaceSection';
import {
    type ConversationShellProps,
    useConversationShellController,
} from '@/web/components/conversation/shell/useConversationShellController';
import { ConversationSidebarPane } from '@/web/components/conversation/sidebar/conversationSidebarPane';

export function ConversationShell(props: ConversationShellProps) {
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const controller = useConversationShellController({
        ...props,
        isSidebarCollapsed,
        onToggleSidebarCollapsed: () => {
            setIsSidebarCollapsed((current) => !current);
        },
    });

    return (
        <main className='bg-background flex h-full min-h-0 min-w-0 flex-1 overflow-hidden'>
            <ConversationSidebarPane {...controller.sidebarPaneProps} />
            <ConversationWorkspaceSection {...controller.workspaceSectionProps} />
            <MessageEditDialog {...controller.messageEditDialogProps} />
            <BranchWorkflowDialog {...controller.branchWorkflowDialogProps} />
        </main>
    );
}
