import type { MessagePartRecord, MessageRecord } from '@/app/backend/persistence/types';

export type SessionMessagesQueryData = {
    messages: MessageRecord[];
    messageParts: MessagePartRecord[];
};
