import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import type { PendingMessageEdit } from '@/web/components/conversation/shell/editFlow';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';

export function createPendingMessageEdit(
    entry: MessageFlowMessage,
    forcedMode?: PendingMessageEdit['forcedMode']
): PendingMessageEdit | undefined {
    if (!isEntityId(entry.id, 'msg')) {
        return undefined;
    }

    const editableText = entry.editableText?.trim();
    if (!editableText) {
        return undefined;
    }

    return {
        messageId: entry.id,
        initialText: editableText,
        ...(forcedMode ? { forcedMode } : {}),
    };
}
