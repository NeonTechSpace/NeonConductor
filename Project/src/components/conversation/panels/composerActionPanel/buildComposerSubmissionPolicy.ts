import type { ComposerActionPanelProps, ComposerSubmissionPolicy } from '@/web/components/conversation/panels/composerActionPanel/types';

export function buildComposerSubmissionPolicy(
    input: Pick<
        ComposerActionPanelProps,
        | 'pendingImages'
        | 'pendingTextFiles'
        | 'canAttachImages'
        | 'imageAttachmentBlockedReason'
        | 'selectedModelCompatibilityState'
        | 'selectedModelCompatibilityReason'
        | 'runErrorMessage'
        | 'maxImageAttachmentsPerMessage'
    > & {
        draftPrompt: string;
        composerSubmitDisabled: boolean;
        slashCommandError?: string;
        isSubmitting: boolean;
    }
): ComposerSubmissionPolicy {
    const hasBlockingPendingImages = input.pendingImages.some((image) => image.status !== 'ready');
    const hasBlockingPendingTextFiles = input.pendingTextFiles.some((file) => file.status === 'reading');
    const hasSubmittableContent =
        input.draftPrompt.trim().length > 0 ||
        input.pendingImages.some((image) => image.status === 'ready') ||
        input.pendingTextFiles.some((file) => file.status === 'ready');
    const hasUnsupportedPendingImages = input.pendingImages.length > 0 && !input.canAttachImages;
    const attachmentStatusMessage = hasUnsupportedPendingImages
        ? (input.imageAttachmentBlockedReason ?? 'Select a vision-capable model to send attached images.')
        : input.selectedModelCompatibilityState === 'incompatible' && input.selectedModelCompatibilityReason
          ? input.selectedModelCompatibilityReason
          : hasBlockingPendingImages || hasBlockingPendingTextFiles
            ? 'Sending is locked until every attached file finishes processing.'
            : input.pendingImages.length > 0 || input.pendingTextFiles.length > 0
              ? 'Attachments are ready to send with this message.'
              : input.canAttachImages
                ? `Attach up to ${String(input.maxImageAttachmentsPerMessage)} images plus UTF-8 text/code files, or send text-only.`
                : 'Text-only prompt.';
    const composerFooterMessage = input.composerSubmitDisabled
        ? 'Create or select a thread before you start the run.'
        : attachmentStatusMessage;

    return {
        hasBlockingPendingImages,
        hasSubmittableContent,
        hasUnsupportedPendingImages,
        canSubmit:
            !input.composerSubmitDisabled &&
            !input.isSubmitting &&
            hasSubmittableContent &&
            !hasBlockingPendingImages &&
            !hasBlockingPendingTextFiles &&
            !hasUnsupportedPendingImages &&
            input.selectedModelCompatibilityState !== 'incompatible',
        attachmentStatusMessage,
        composerFooterMessage,
        composerErrorMessage: input.slashCommandError ?? input.runErrorMessage,
    };
}
