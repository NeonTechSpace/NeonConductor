import { useEffect, useRef, useState } from 'react';

import {
    createPendingImage,
    MAX_COMPOSER_TOTAL_IMAGE_BYTES,
    prepareComposerImageAttachment,
    releasePendingImageResources,
    summarizeReadyImageBytes,
    type ComposerPendingImage,
} from '@/web/components/conversation/hooks/composerImageAttachments';
import { submitPrompt as submitPromptFromComposer } from '@/web/components/conversation/shell/actions/promptSubmit';

import type {
    EntityId,
    PlanStartInput,
    PlanRecordView,
    RuntimeProviderId,
    RuntimeRunOptions,
    SessionStartRunInput,
    TopLevelTab,
} from '@/shared/contracts';

interface ProviderAuthView {
    label: string;
    authState: string;
    authMethod: string;
}

interface UseConversationShellComposerInput<
    TPlanStartResult extends { plan: PlanRecordView },
    TRunStartAcceptedResult extends { accepted: true },
    TRunStartRejectedResult extends { accepted: false; message?: string },
> {
    profileId: string;
    selectedSessionId: string | undefined;
    isPlanningMode: boolean;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint: string | undefined;
    worktreeId?: EntityId<'wt'>;
    resolvedRunTarget:
        | {
              providerId: RuntimeProviderId;
              modelId: string;
          }
        | undefined;
    providerById: Map<RuntimeProviderId, ProviderAuthView>;
    runtimeOptions: RuntimeRunOptions;
    isStartingRun: boolean;
    canAttachImages: boolean;
    maxImageAttachmentsPerMessage: number;
    imageCompressionConcurrency: number;
    imageAttachmentBlockedReason?: string;
    submitBlockedReason?: string;
    startPlan: (input: PlanStartInput) => Promise<TPlanStartResult>;
    startRun: (input: SessionStartRunInput) => Promise<TRunStartAcceptedResult | TRunStartRejectedResult>;
    onPlanStarted: (result: TPlanStartResult) => void;
    onRunStarted: (result: TRunStartAcceptedResult) => void;
}

export function useConversationShellComposer<
    TPlanStartResult extends { plan: PlanRecordView },
    TRunStartAcceptedResult extends { accepted: true },
    TRunStartRejectedResult extends { accepted: false; message?: string },
>(input: UseConversationShellComposerInput<TPlanStartResult, TRunStartAcceptedResult, TRunStartRejectedResult>) {
    const [pendingImages, setPendingImages] = useState<ComposerPendingImage[]>([]);
    const [runSubmitError, setRunSubmitError] = useState<string | undefined>(undefined);
    const [promptResetKey, setPromptResetKey] = useState(0);
    const pendingImagesRef = useRef<ComposerPendingImage[]>([]);
    const promptRef = useRef('');

    useEffect(() => {
        pendingImagesRef.current = pendingImages;
    }, [pendingImages]);

    useEffect(() => {
        return () => {
            for (const image of pendingImagesRef.current) {
                releasePendingImageResources(image);
            }
        };
    }, []);

    function clearPendingImages() {
        setPendingImages((current) => {
            for (const image of current) {
                releasePendingImageResources(image);
            }

            return [];
        });
    }

    function failImageAttachment(message: string) {
        setRunSubmitError(message);
    }

    function toFailedImageState(image: ComposerPendingImage, errorMessage: string): ComposerPendingImage {
        return {
            clientId: image.clientId,
            fileName: image.fileName,
            sourceFile: image.sourceFile,
            previewUrl: image.previewUrl,
            status: 'failed',
            errorMessage,
        };
    }

    function toQueuedImageState(image: ComposerPendingImage): ComposerPendingImage {
        return {
            clientId: image.clientId,
            fileName: image.fileName,
            sourceFile: image.sourceFile,
            previewUrl: image.previewUrl,
            status: 'queued',
        };
    }

    function toCompressingImageState(image: ComposerPendingImage): ComposerPendingImage {
        return {
            clientId: image.clientId,
            fileName: image.fileName,
            sourceFile: image.sourceFile,
            previewUrl: image.previewUrl,
            status: 'compressing',
        };
    }

    function startCompressingImage(image: ComposerPendingImage) {
        void prepareComposerImageAttachment(image.sourceFile, image.clientId).then((preparedResult) => {
            if (preparedResult.isErr()) {
                const message = preparedResult.error.message;
                setPendingImages((current) =>
                    current.map((candidate) =>
                        candidate.clientId === image.clientId ? toFailedImageState(candidate, message) : candidate
                    )
                );
                failImageAttachment(message);
                return;
            }

            const prepared = preparedResult.value;
            setPendingImages((current) => {
                const existing = current.find((candidate) => candidate.clientId === image.clientId);
                if (!existing) {
                    return current;
                }

                const nextTotalBytes = summarizeReadyImageBytes(current, image.clientId) + prepared.byteSize;
                if (nextTotalBytes > MAX_COMPOSER_TOTAL_IMAGE_BYTES) {
                    return current.map((candidate) =>
                        candidate.clientId === image.clientId
                            ? toFailedImageState(candidate, 'Attached images exceed the 6 MB total payload limit.')
                            : candidate
                    );
                }

                releasePendingImageResources(existing);
                return current.map((candidate) =>
                    candidate.clientId === image.clientId
                        ? {
                              ...candidate,
                              previewUrl: prepared.previewUrl,
                              status: 'ready',
                              attachment: prepared.attachment,
                              byteSize: prepared.byteSize,
                          }
                        : candidate
                );
            });
        });
    }

    function onAddImageFiles(inputFiles: FileList | File[]) {
        setRunSubmitError(undefined);

        if (!input.canAttachImages) {
            failImageAttachment(
                input.imageAttachmentBlockedReason ?? 'Select a vision-capable run target to attach images.'
            );
            return;
        }

        const allFiles = Array.from(inputFiles);
        const imageFiles = allFiles.filter((file) => file.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            failImageAttachment('Only image files can be attached to a prompt.');
            return;
        }

        const availableSlots = Math.max(0, input.maxImageAttachmentsPerMessage - pendingImagesRef.current.length);
        if (availableSlots === 0) {
            failImageAttachment(
                `You can attach up to ${String(input.maxImageAttachmentsPerMessage)} images per message.`
            );
            return;
        }

        const acceptedFiles = imageFiles.slice(0, availableSlots);
        if (acceptedFiles.length < imageFiles.length) {
            failImageAttachment(`Only the first ${String(input.maxImageAttachmentsPerMessage)} images were kept.`);
        }

        const nextImages = acceptedFiles.map((file) => createPendingImage(file));
        setPendingImages((current) => [...current, ...nextImages]);
    }

    function removePendingImage(clientId: string) {
        setRunSubmitError(undefined);
        setPendingImages((current) => {
            const image = current.find((candidate) => candidate.clientId === clientId);
            if (image) {
                releasePendingImageResources(image);
            }

            return current.filter((candidate) => candidate.clientId !== clientId);
        });
    }

    function retryPendingImage(clientId: string) {
        setRunSubmitError(undefined);
        const image = pendingImagesRef.current.find((candidate) => candidate.clientId === clientId);
        if (!image) {
            return;
        }

        setPendingImages((current) =>
            current.map((candidate) => (candidate.clientId === clientId ? toQueuedImageState(candidate) : candidate))
        );
    }

    useEffect(() => {
        const activeCompressionCount = pendingImages.filter((image) => image.status === 'compressing').length;
        const availableCompressionSlots = Math.max(0, input.imageCompressionConcurrency - activeCompressionCount);
        if (availableCompressionSlots === 0) {
            return;
        }

        const queuedImages = pendingImages
            .filter((image) => image.status === 'queued')
            .slice(0, availableCompressionSlots);
        if (queuedImages.length === 0) {
            return;
        }

        for (const queuedImage of queuedImages) {
            setPendingImages((current) =>
                current.map((candidate) =>
                    candidate.clientId === queuedImage.clientId ? toCompressingImageState(candidate) : candidate
                )
            );
            startCompressingImage(queuedImage);
        }
    }, [input.imageCompressionConcurrency, pendingImages]);

    const readyAttachments = pendingImages.flatMap((image) =>
        image.status === 'ready' && image.attachment ? [image.attachment] : []
    );
    const hasBlockingPendingImages = pendingImages.some((image) => image.status !== 'ready');

    return {
        pendingImages,
        promptResetKey,
        hasBlockingPendingImages,
        runSubmitError,
        setRunSubmitError,
        clearRunSubmitError: () => {
            setRunSubmitError(undefined);
        },
        resetComposer: () => {
            promptRef.current = '';
            setPromptResetKey((current) => current + 1);
            clearPendingImages();
            setRunSubmitError(undefined);
        },
        onPromptEdited: () => {
            setRunSubmitError(undefined);
        },
        onAddImageFiles,
        onRemovePendingImage: removePendingImage,
        onRetryPendingImage: retryPendingImage,
        onSubmitPrompt: (prompt: string) => {
            promptRef.current = prompt;
            const hasPromptContent = prompt.trim().length > 0;
            const hasSubmittableComposerContent = hasPromptContent || readyAttachments.length > 0;

            if (!hasSubmittableComposerContent) {
                return;
            }
            if (hasBlockingPendingImages) {
                failImageAttachment('Wait until all attached images are ready, or remove the failed ones.');
                return;
            }
            if (readyAttachments.length > 0 && !input.canAttachImages) {
                failImageAttachment(
                    input.imageAttachmentBlockedReason ?? 'Select a vision-capable run target to attach images.'
                );
                return;
            }
            if (input.submitBlockedReason) {
                setRunSubmitError(input.submitBlockedReason);
                return;
            }

            void submitPromptFromComposer<TPlanStartResult, TRunStartAcceptedResult>({
                prompt: promptRef.current,
                ...(readyAttachments.length > 0 ? { attachments: readyAttachments } : {}),
                isStartingRun: input.isStartingRun,
                selectedSessionId: input.selectedSessionId,
                isPlanningMode: input.isPlanningMode,
                profileId: input.profileId,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                workspaceFingerprint: input.workspaceFingerprint,
                ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
                resolvedRunTarget: input.resolvedRunTarget,
                runtimeOptions: input.runtimeOptions,
                providerById: input.providerById,
                startPlan: input.startPlan,
                startRun: input.startRun,
                onPromptCleared: () => {
                    setRunSubmitError(undefined);
                    promptRef.current = '';
                    setPromptResetKey((current) => current + 1);
                    clearPendingImages();
                },
                onPlanStarted: (result) => {
                    input.onPlanStarted(result);
                },
                onRunStarted: (result) => {
                    input.onRunStarted(result);
                },
                onError: (message) => {
                    setRunSubmitError(message);
                },
            });
        },
    };
}
