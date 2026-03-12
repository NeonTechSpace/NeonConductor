import { useState } from 'react';

import { ComposerMediaSettingsSection } from '@/web/components/settings/composerMediaSettingsSection';
import type { ComposerMediaSettingsDraft } from '@/web/components/settings/composerMediaSettingsDrafts';

import {
    MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
} from '@/shared/contracts';

interface ContextComposerMediaSectionProps {
    initialDraft: ComposerMediaSettingsDraft;
    isSaving: boolean;
    onClearFeedback: () => void;
    onSave: (draft: ComposerMediaSettingsDraft) => Promise<void>;
}

export function ContextComposerMediaSection({
    initialDraft,
    isSaving,
    onClearFeedback,
    onSave,
}: ContextComposerMediaSectionProps) {
    const [draft, setDraft] = useState(initialDraft);

    return (
        <ComposerMediaSettingsSection
            draft={draft}
            isSaving={isSaving}
            onDraftChange={(updater) => {
                setDraft((current) => updater(current));
                onClearFeedback();
            }}
            onSave={() => {
                const maxImageAttachmentsPerMessage = Number(draft.maxImageAttachmentsPerMessage);
                if (
                    !Number.isInteger(maxImageAttachmentsPerMessage) ||
                    maxImageAttachmentsPerMessage < 1 ||
                    maxImageAttachmentsPerMessage > MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE
                ) {
                    return;
                }

                const imageCompressionConcurrency = Number(draft.imageCompressionConcurrency);
                if (
                    !Number.isInteger(imageCompressionConcurrency) ||
                    imageCompressionConcurrency < 1 ||
                    imageCompressionConcurrency > MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY
                ) {
                    return;
                }

                void onSave(draft);
            }}
        />
    );
}
