import type { EntityId } from '@/shared/contracts';

export interface PendingMessageEdit {
    messageId: EntityId<'msg'>;
    initialText: string;
    forcedMode?: 'branch';
}

export function toEditFailureMessage(reason: string): string {
    if (reason === 'message_not_found') {
        return 'Could not find the selected message for editing.';
    }
    if (reason === 'message_not_editable') {
        return 'Only user text messages can be edited.';
    }
    if (reason === 'session_not_found') {
        return 'The selected session no longer exists.';
    }
    if (reason === 'run_not_found') {
        return 'The target run for this message was not found.';
    }
    if (reason === 'no_turns') {
        return 'No turns are available to edit in this session.';
    }
    if (reason === 'auto_start_required') {
        return 'Message edits currently require starting a replacement run.';
    }
    if (reason === 'run_start_rejected') {
        return 'The edited run could not be started.';
    }
    if (reason === 'thread_tab_mismatch') {
        return 'Edit is not allowed from this tab because the thread belongs to another mode.';
    }
    return `Edit failed: ${reason}`;
}

export function toBranchFailureMessage(reason: string): string {
    if (reason === 'message_not_found') {
        return 'Could not find the selected message for branching.';
    }
    if (reason === 'message_not_branchable') {
        return 'Only user and assistant messages can be branched.';
    }
    if (reason === 'session_not_found') {
        return 'The selected session no longer exists.';
    }
    if (reason === 'thread_tab_mismatch') {
        return 'Branch is not allowed from this tab because the thread belongs to another mode.';
    }

    return `Branch failed: ${reason}`;
}
