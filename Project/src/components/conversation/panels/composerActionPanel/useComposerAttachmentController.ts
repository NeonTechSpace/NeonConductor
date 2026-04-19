import { useRef, useState } from 'react';

import {
    extractClipboardFiles,
    extractDroppedFiles,
} from '@/web/components/conversation/panels/composerActionPanel/helpers';
import { readRelatedTargetNode } from '@/web/lib/dom/readRelatedTargetNode';

import type { ComposerLightboxState } from '@/web/components/conversation/panels/composerActionPanel/types';

export function useComposerAttachmentController(input: {
    canAttachFiles: boolean;
    controlsDisabled: boolean;
    onAddFiles: (files: FileList | File[]) => void;
}) {
    const [isDragActive, setIsDragActive] = useState(false);
    const [lightboxImage, setLightboxImage] = useState<ComposerLightboxState | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement>(null);

    return {
        isDragActive,
        lightboxImage,
        fileInputRef,
        openFilePicker() {
            fileInputRef.current?.click();
        },
        closeLightbox() {
            setLightboxImage(undefined);
        },
        previewImage(image: ComposerLightboxState) {
            setLightboxImage(image);
        },
        handleDragOver(event: React.DragEvent<HTMLDivElement>) {
            event.preventDefault();
            if (!input.canAttachFiles || input.controlsDisabled) {
                return;
            }

            setIsDragActive(true);
        },
        handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
            if (event.currentTarget.contains(readRelatedTargetNode(event.relatedTarget))) {
                return;
            }

            setIsDragActive(false);
        },
        handleDrop(event: React.DragEvent<HTMLDivElement>) {
            event.preventDefault();
            setIsDragActive(false);
            if (!input.canAttachFiles || input.controlsDisabled) {
                return;
            }

            const files = extractDroppedFiles(event.dataTransfer);
            if (files.length === 0) {
                return;
            }

            input.onAddFiles(files);
        },
        handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
            if (event.target.files && event.target.files.length > 0) {
                input.onAddFiles(event.target.files);
                event.target.value = '';
            }
        },
        handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
            const files = extractClipboardFiles(event.clipboardData);
            if (files.length === 0) {
                return;
            }

            input.onAddFiles(files);
            if (event.clipboardData.getData('text').trim().length === 0) {
                event.preventDefault();
            }
        },
    };
}
