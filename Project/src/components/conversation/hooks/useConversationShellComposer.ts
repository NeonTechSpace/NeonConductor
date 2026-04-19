import { useEffect, useRef, useState } from 'react';

import {
    type PreparedComposerImageAttachment,
    createPendingImage,
    prepareComposerImageAttachment,
    releasePendingImageResources,
    type ComposerPendingImage,
} from '@/web/components/conversation/hooks/composerImageAttachments';
import {
    createPendingTextFile,
    prepareComposerTextFileAttachment,
    type ComposerPendingTextFile,
} from '@/web/components/conversation/hooks/composerTextFileAttachments';
import {
    failComposerPendingImage,
    pumpComposerPendingImages,
    queueComposerPendingImageForRetry,
    resolvePreparedComposerPendingImage,
} from '@/web/components/conversation/hooks/conversationComposerPendingImageQueue';
import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
import { submitPrompt as submitPromptFromComposer } from '@/web/components/conversation/shell/actions/promptSubmit';
import type { PlanningDepth } from '@/web/components/conversation/shell/planningDepth';

import type {
    EntityId,
    PlanStartInput,
    PlanRecordView,
    RuntimeProviderId,
    RuntimeRunOptions,
    SessionStartRunInput,
    TopLevelTab,
} from '@/shared/contracts';
import { isEntityId } from '@/shared/contracts';

type ComposerPlanStartInput = PlanStartInput & {
    planningDepth?: PlanningDepth;
};

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
    sandboxId?: EntityId<'sb'>;
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
    planningDepthSelection: PlanningDepth;
    startPlan: (input: ComposerPlanStartInput) => Promise<TPlanStartResult>;
    startRun: (input: SessionStartRunInput) => Promise<TRunStartAcceptedResult | TRunStartRejectedResult>;
    queueRun: (input: SessionStartRunInput) => Promise<unknown>;
    onPlanStarted: (result: TPlanStartResult) => void;
    onRunStarted: (result: TRunStartAcceptedResult) => void;
}

function readComposerImagePreparationErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Image preparation failed.';
}

export async function preparePendingComposerImage(input: {
    clientId: string;
    sourceFile: File;
    prepareImageAttachment: typeof prepareComposerImageAttachment;
    onPreparedImage: (clientId: string, prepared: PreparedComposerImageAttachment) => void;
    onFailedImage: (clientId: string, message: string) => void;
    onAttachmentError: (message: string) => void;
    onQueueProgressed: () => void;
}): Promise<void> {
    try {
        const preparedResult = await input.prepareImageAttachment(input.sourceFile, input.clientId);
        if (preparedResult.isErr()) {
            const message = preparedResult.error.message;
            input.onFailedImage(input.clientId, message);
            input.onAttachmentError(message);
            return;
        }

        input.onPreparedImage(input.clientId, preparedResult.value);
    } catch (error) {
        const message = readComposerImagePreparationErrorMessage(error);
        input.onFailedImage(input.clientId, message);
        input.onAttachmentError(message);
    } finally {
        input.onQueueProgressed();
    }
}

export function useConversationShellComposer<
    TPlanStartResult extends { plan: PlanRecordView },
    TRunStartAcceptedResult extends { accepted: true },
    TRunStartRejectedResult extends { accepted: false; message?: string },
>(input: UseConversationShellComposerInput<TPlanStartResult, TRunStartAcceptedResult, TRunStartRejectedResult>) {
    const [pendingImages, setPendingImages] = useState<ComposerPendingImage[]>([]);
    const [pendingTextFiles, setPendingTextFiles] = useState<ComposerPendingTextFile[]>([]);
    const [optimisticUserMessage, setOptimisticUserMessage] = useState<OptimisticConversationUserMessage | undefined>(
        undefined
    );
    const [runSubmitError, setRunSubmitError] = useState<string | undefined>(undefined);
    const [promptResetKey, setPromptResetKey] = useState(0);
    const pendingImagesRef = useRef<ComposerPendingImage[]>([]);
    const pendingTextFilesRef = useRef<ComposerPendingTextFile[]>([]);
    const promptRef = useRef('');

    useEffect(() => {
        return () => {
            for (const image of pendingImagesRef.current) {
                releasePendingImageResources(image);
            }
        };
    }, []);

    function replacePendingImages(nextImages: ComposerPendingImage[]) {
        pendingImagesRef.current = nextImages;
        setPendingImages(nextImages);
    }

    function replacePendingTextFiles(nextFiles: ComposerPendingTextFile[]) {
        pendingTextFilesRef.current = nextFiles;
        setPendingTextFiles(nextFiles);
    }

    function updatePendingImages(updater: (current: ComposerPendingImage[]) => ComposerPendingImage[]) {
        const nextImages = updater(pendingImagesRef.current);
        replacePendingImages(nextImages);
        return nextImages;
    }

    function clearPendingImages() {
        for (const image of pendingImagesRef.current) {
            releasePendingImageResources(image);
        }
        replacePendingImages([]);
    }

    function clearPendingTextFiles() {
        replacePendingTextFiles([]);
    }

    function failImageAttachment(message: string) {
        setRunSubmitError(message);
    }

    function pumpPendingImageCompressionQueue() {
        const pumpResult = pumpComposerPendingImages(pendingImagesRef.current, input.imageCompressionConcurrency);
        if (pumpResult.imagesToStart.length === 0) {
            return;
        }

        replacePendingImages(pumpResult.nextImages);
        for (const image of pumpResult.imagesToStart) {
            startCompressingImage(image.clientId, image.sourceFile);
        }
    }

    function resolvePreparedImage(clientId: string, prepared: PreparedComposerImageAttachment) {
        let replacedImage: ComposerPendingImage | undefined;
        let errorMessage: string | undefined;

        updatePendingImages((current) => {
            const preparedResult = resolvePreparedComposerPendingImage(current, clientId, prepared);
            replacedImage = preparedResult.replacedImage;
            errorMessage = preparedResult.errorMessage;
            return preparedResult.nextImages;
        });

        if (replacedImage) {
            releasePendingImageResources(replacedImage);
        }
        if (errorMessage) {
            failImageAttachment(errorMessage);
        }
    }

    function startCompressingImage(clientId: string, sourceFile: File) {
        void preparePendingComposerImage({
            clientId,
            sourceFile,
            prepareImageAttachment: prepareComposerImageAttachment,
            onPreparedImage: resolvePreparedImage,
            onFailedImage: (failedClientId, message) => {
                updatePendingImages((current) => failComposerPendingImage(current, failedClientId, message));
            },
            onAttachmentError: failImageAttachment,
            onQueueProgressed: pumpPendingImageCompressionQueue,
        });
    }

    async function prepareTextFile(file: File, clientId: string) {
        const prepared = await prepareComposerTextFileAttachment(file, clientId);
        replacePendingTextFiles(
            pendingTextFilesRef.current.map((candidate) =>
                candidate.clientId !== clientId
                    ? candidate
                    : prepared.isOk()
                      ? {
                            clientId,
                            fileName: file.name,
                            status: 'ready',
                            byteSize: prepared.value.attachment.byteSize,
                            attachment: prepared.value.attachment,
                        }
                      : {
                            clientId,
                            fileName: file.name,
                            status: 'failed',
                            errorMessage: prepared.error.message,
                        }
            )
        );
        if (prepared.isErr()) {
            failImageAttachment(prepared.error.message);
        }
    }

    function onAddFiles(inputFiles: FileList | File[]) {
        setRunSubmitError(undefined);

        const allFiles = Array.from(inputFiles);
        const imageFiles = allFiles.filter((file) => file.type.startsWith('image/'));
        const textFiles = allFiles.filter((file) => !file.type.startsWith('image/'));
        if (imageFiles.length === 0 && textFiles.length === 0) {
            failImageAttachment('Only screenshots/images and UTF-8 text/code files can be attached to a prompt.');
            return;
        }

        if (imageFiles.length > 0) {
            if (!input.canAttachImages) {
                failImageAttachment(
                    input.imageAttachmentBlockedReason ?? 'Select a vision-capable run target to attach images.'
                );
            } else {
                const availableSlots = Math.max(0, input.maxImageAttachmentsPerMessage - pendingImagesRef.current.length);
                if (availableSlots === 0) {
                    failImageAttachment(
                        `You can attach up to ${String(input.maxImageAttachmentsPerMessage)} images per message.`
                    );
                } else {
                    const acceptedImageFiles = imageFiles.slice(0, availableSlots);
                    if (acceptedImageFiles.length < imageFiles.length) {
                        failImageAttachment(`Only the first ${String(input.maxImageAttachmentsPerMessage)} images were kept.`);
                    }

                    const nextImages = acceptedImageFiles.map((file) => createPendingImage(file));
                    updatePendingImages((current) => [...current, ...nextImages]);
                    pumpPendingImageCompressionQueue();
                }
            }
        }

        if (textFiles.length > 0) {
            const nextPendingFiles = textFiles.map((file) => createPendingTextFile(file));
            replacePendingTextFiles([...pendingTextFilesRef.current, ...nextPendingFiles]);
            nextPendingFiles.forEach((pendingFile, index) => {
                const sourceFile = textFiles[index];
                if (!sourceFile) {
                    return;
                }
                void prepareTextFile(sourceFile, pendingFile.clientId);
            });
        }
    }

    function removePendingImage(clientId: string) {
        setRunSubmitError(undefined);
        const removedImage = pendingImagesRef.current.find((candidate) => candidate.clientId === clientId);
        if (!removedImage) {
            return;
        }

        releasePendingImageResources(removedImage);
        replacePendingImages(pendingImagesRef.current.filter((candidate) => candidate.clientId !== clientId));
        pumpPendingImageCompressionQueue();
    }

    function retryPendingImage(clientId: string) {
        setRunSubmitError(undefined);
        const image = pendingImagesRef.current.find((candidate) => candidate.clientId === clientId);
        if (!image) {
            return;
        }

        updatePendingImages((current) => queueComposerPendingImageForRetry(current, clientId));
        pumpPendingImageCompressionQueue();
    }

    useEffect(() => {
        pumpPendingImageCompressionQueue();
    }, [input.imageCompressionConcurrency]);

    const readyAttachments = [
        ...pendingImages.flatMap((image) => (image.status === 'ready' && image.attachment ? [image.attachment] : [])),
        ...pendingTextFiles.flatMap((file) => (file.status === 'ready' && file.attachment ? [file.attachment] : [])),
    ];
    const hasBlockingPendingImages = pendingImages.some((image) => image.status !== 'ready');
    const hasBlockingPendingTextFiles = pendingTextFiles.some((file) => file.status === 'reading');

    function createOptimisticUserMessage(
        sessionId: OptimisticConversationUserMessage['sessionId'],
        prompt: string
    ): OptimisticConversationUserMessage {
        const seed = `${String(Date.now())}_${String(Math.round(Math.random() * 1000))}`;
        return {
            id: `optimistic_msg_${seed}`,
            runId: `optimistic_run_${seed}`,
            sessionId,
            createdAt: new Date().toISOString(),
            prompt,
        };
    }

    return {
        pendingImages,
        pendingTextFiles,
        optimisticUserMessage,
        promptResetKey,
        hasBlockingPendingImages,
        hasBlockingPendingTextFiles,
        runSubmitError,
        setRunSubmitError,
        clearRunSubmitError: () => {
            setRunSubmitError(undefined);
        },
        resetComposer: () => {
            promptRef.current = '';
            setPromptResetKey((current) => current + 1);
            clearPendingImages();
            clearPendingTextFiles();
            setRunSubmitError(undefined);
        },
        onPromptEdited: () => {
            setRunSubmitError(undefined);
        },
        onAddFiles,
        onRemovePendingImage: removePendingImage,
        onRemovePendingTextFile: (clientId: string) => {
            replacePendingTextFiles(pendingTextFilesRef.current.filter((candidate) => candidate.clientId !== clientId));
        },
        onRetryPendingImage: retryPendingImage,
        onQueuePrompt: (prompt: string) => {
            promptRef.current = prompt;
            const hasPromptContent = prompt.trim().length > 0;
            const hasSubmittableComposerContent = hasPromptContent || readyAttachments.length > 0;

            if (!hasSubmittableComposerContent) {
                return;
            }
            if (hasBlockingPendingImages || hasBlockingPendingTextFiles) {
                failImageAttachment('Wait until all attached files are ready, or remove the failed ones.');
                return;
            }
            if (readyAttachments.some((attachment) => attachment.kind !== 'text_file_attachment') && !input.canAttachImages) {
                failImageAttachment(
                    input.imageAttachmentBlockedReason ?? 'Select a vision-capable run target to attach images.'
                );
                return;
            }
            if (input.submitBlockedReason) {
                setRunSubmitError(input.submitBlockedReason);
                return;
            }
            if (typeof input.selectedSessionId !== 'string' || !isEntityId(input.selectedSessionId, 'sess')) {
                return;
            }
            const selectedSessionId = input.selectedSessionId;

            void input
                .queueRun({
                    profileId: input.profileId,
                    sessionId: selectedSessionId,
                    prompt: promptRef.current.trim(),
                    topLevelTab: input.topLevelTab,
                    modeKey: input.modeKey,
                    ...(input.resolvedRunTarget ? { providerId: input.resolvedRunTarget.providerId } : {}),
                    ...(input.resolvedRunTarget ? { modelId: input.resolvedRunTarget.modelId } : {}),
                    ...(readyAttachments.length > 0 ? { attachments: readyAttachments } : {}),
                    ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                    ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
                    runtimeOptions: input.runtimeOptions,
                })
                .then(() => {
                    setRunSubmitError(undefined);
                    promptRef.current = '';
                    setPromptResetKey((current) => current + 1);
                    clearPendingImages();
                    clearPendingTextFiles();
                })
                .catch((error: unknown) => {
                    setRunSubmitError(error instanceof Error ? error.message : String(error));
                });
        },
        onSubmitPrompt: (prompt: string) => {
            promptRef.current = prompt;
            const hasPromptContent = prompt.trim().length > 0;
            const hasSubmittableComposerContent = hasPromptContent || readyAttachments.length > 0;

            if (!hasSubmittableComposerContent) {
                return;
            }
            if (hasBlockingPendingImages || hasBlockingPendingTextFiles) {
                failImageAttachment('Wait until all attached files are ready, or remove the failed ones.');
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
                planningDepthSelection: input.planningDepthSelection,
                workspaceFingerprint: input.workspaceFingerprint,
                ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
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
                    clearPendingTextFiles();
                },
                onPlanStarted: (result) => {
                    input.onPlanStarted(result);
                },
                onRunStarted: (result) => {
                    setOptimisticUserMessage(undefined);
                    input.onRunStarted(result);
                },
                onRunStartRequested: ({ sessionId, prompt }) => {
                    setOptimisticUserMessage(createOptimisticUserMessage(sessionId, prompt));
                },
                onRunStartFinished: () => {
                    setOptimisticUserMessage(undefined);
                },
                onError: (message) => {
                    setOptimisticUserMessage(undefined);
                    setRunSubmitError(message);
                },
            });
        },
    };
}
