import { FlowMessageView } from '@/web/components/conversation/messages/flow/flowMessageView';
import type { MessageFlowMessage, MessageFlowTurn } from '@/web/components/conversation/messages/messageFlowModel';
import { WorkbenchTimelineContextRows } from '@/web/components/conversation/messages/workbenchTimelineContextRows';
import type { WorkspaceInspectorSectionId } from '@/web/components/conversation/sessions/workspaceShellModel';

import type { PermissionRecord, RunRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/shared/contracts';

interface MessageFlowTurnViewProps {
    profileId: string;
    turn: MessageFlowTurn;
    run: RunRecord | undefined;
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
    onOpenToolArtifact?: (messagePartId: EntityId<'part'>) => void;
    onPromoteMessage?: (messageId: EntityId<'msg'>) => void;
    isResolvingPermission?: boolean;
    onResolvePermission?: (
        requestId: PermissionRecord['id'],
        resolution: 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace',
        selectedApprovalResource?: string
    ) => void;
    onOpenInspectorSection?: (sectionId: WorkspaceInspectorSectionId) => void;
}

export function MessageFlowEmptyState() {
    return (
        <div className='flex min-h-[16rem] items-center justify-center'>
            <div className='text-muted-foreground border-border bg-card/50 max-w-xl rounded-[1.6rem] border px-6 py-8 text-center text-sm'>
                No messages yet for this session. Start a run to populate the conversation.
            </div>
        </div>
    );
}

export function MessageFlowTurnView({
    profileId,
    turn,
    run,
    onEditMessage,
    onBranchFromMessage,
    onOpenToolArtifact,
    onPromoteMessage,
    isResolvingPermission,
    onResolvePermission,
    onOpenInspectorSection,
}: MessageFlowTurnViewProps) {
    return (
        <section className='space-y-6'>
            {turn.messages.map((message) => (
                <FlowMessageView
                    key={message.id}
                    profileId={profileId}
                    message={message}
                    run={run}
                    {...(onEditMessage ? { onEditMessage } : {})}
                    {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                    {...(onOpenToolArtifact ? { onOpenToolArtifact } : {})}
                    {...(onPromoteMessage ? { onPromoteMessage } : {})}
                />
            ))}
            <WorkbenchTimelineContextRows
                items={turn.timelineItems}
                {...(isResolvingPermission !== undefined ? { isResolvingPermission } : {})}
                {...(onResolvePermission ? { onResolvePermission } : {})}
                {...(onOpenInspectorSection ? { onOpenInspectorSection } : {})}
            />
        </section>
    );
}
