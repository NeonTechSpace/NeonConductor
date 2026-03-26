import {
    composerImageAttachmentMimeTypes,
    type ComposerImageAttachmentMimeType,
} from '@/shared/contracts/types/session';

export function readImageMimeType(value: unknown): ComposerImageAttachmentMimeType | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    return composerImageAttachmentMimeTypes.find((mimeType) => mimeType === value);
}
