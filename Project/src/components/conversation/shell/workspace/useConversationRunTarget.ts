import type { ConversationRunTargetInput } from '@/web/components/conversation/shell/workspace/runTargetSelection';
import { buildConversationRunTargetModel } from '@/web/components/conversation/shell/workspace/runTargetSelection';

export function useConversationRunTarget(input: ConversationRunTargetInput) {
    return buildConversationRunTargetModel(input);
}

