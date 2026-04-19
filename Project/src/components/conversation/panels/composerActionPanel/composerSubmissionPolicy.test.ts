import { describe, expect, it } from 'vitest';

import { buildComposerSubmissionPolicy } from '@/web/components/conversation/panels/composerActionPanel/composerSubmissionPolicy';

function createPolicyInput(overrides: Partial<Parameters<typeof buildComposerSubmissionPolicy>[0]> = {}) {
    return {
        pendingImages: [],
        pendingTextFiles: [],
        canAttachImages: true,
        maxImageAttachmentsPerMessage: 4,
        draftPrompt: 'ship it',
        composerSubmitDisabled: false,
        isSubmitting: false,
        runErrorMessage: undefined,
        ...overrides,
    };
}

describe('buildComposerSubmissionPolicy', () => {
    it('blocks submit and preserves attachment guidance when there is nothing to send', () => {
        const policy = buildComposerSubmissionPolicy(
            createPolicyInput({
                draftPrompt: '',
            })
        );

        expect(policy.canSubmit).toBe(false);
        expect(policy.composerFooterMessage).toBe('Attach up to 4 images plus UTF-8 text/code files, or send text-only.');
        expect(policy.attachmentStatusMessage).toBe('Attach up to 4 images plus UTF-8 text/code files, or send text-only.');
    });

    it('prefers slash-command errors over run errors', () => {
        const policy = buildComposerSubmissionPolicy(
            createPolicyInput({
                slashCommandError: 'Slash command failed.',
                runErrorMessage: 'Run failed.',
                selectedModelCompatibilityState: 'incompatible',
                selectedModelCompatibilityReason: 'This model is not usable for the current route.',
            })
        );

        expect(policy.composerErrorMessage).toBe('Slash command failed.');
        expect(policy.attachmentStatusMessage).toBe('This model is not usable for the current route.');
        expect(policy.canSubmit).toBe(false);
    });

    it('blocks submit while images are still preparing', () => {
        const policy = buildComposerSubmissionPolicy(
            createPolicyInput({
                pendingImages: [
                    {
                        clientId: 'img-1',
                        fileName: 'diagram.png',
                        previewUrl: 'blob://diagram',
                        status: 'compressing',
                    },
                ],
            })
        );

        expect(policy.hasBlockingPendingImages).toBe(true);
        expect(policy.canSubmit).toBe(false);
        expect(policy.attachmentStatusMessage).toBe('Sending is locked until every attached file finishes processing.');
    });
});
