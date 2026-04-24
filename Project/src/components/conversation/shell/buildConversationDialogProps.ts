import type { ShellDialogCompositionInput } from '@/web/components/conversation/shell/useConversationShellViewControllers.types';

export function buildConversationDialogProps(input: ShellDialogCompositionInput) {
    return {
        messageEditDialogProps: input.messageEditDialogProps,
        branchWorkflowDialogProps: input.branchWorkflowDialogProps,
        toolArtifactViewerDialogProps: input.toolArtifactViewerDialogProps,
        registryPromotionDialogProps: input.registryPromotionDialogProps,
    };
}
