import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';
import {
    getUpdatesStatusRefetchInterval,
    UPDATES_STATUS_QUERY_OPTIONS,
} from '@/web/components/window/updatesStatusQueryOptions';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RefObject } from 'react';

type UpdateChannel = 'stable' | 'beta' | 'alpha';

interface UpdateControlsPanelProps {
    open: boolean;
    onClose: () => void;
    anchorRef?: RefObject<HTMLElement | null>;
}

const CHANNEL_OPTIONS: Array<{ id: UpdateChannel; label: string; description: string }> = [
    { id: 'stable', label: 'Stable', description: 'Most reliable release channel.' },
    { id: 'beta', label: 'Beta', description: 'Pre-release builds with newer features.' },
    { id: 'alpha', label: 'Alpha', description: 'Earliest builds with highest risk.' },
];

export function UpdateControlsPanel({ open, onClose, anchorRef }: UpdateControlsPanelProps) {
    const utils = trpc.useUtils();
    const panelRef = useRef<HTMLElement>(null);
    const titleId = useId();
    const descriptionId = useId();
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | 'info'>('info');
    const [panelPosition, setPanelPosition] = useState<{ top: number; left: number } | undefined>(undefined);
    const channelQuery = trpc.updates.getChannel.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const switchStatusQuery = trpc.updates.getSwitchStatus.useQuery(undefined, {
        enabled: open,
        ...UPDATES_STATUS_QUERY_OPTIONS,
        refetchInterval: (query) => getUpdatesStatusRefetchInterval(query.state.data),
    });
    const checkMutation = trpc.updates.checkForUpdates.useMutation({
        onSuccess: (result) => {
            setFeedbackTone(result.started ? 'success' : 'info');
            setFeedbackMessage(result.message);
            if (result.started) {
                void utils.updates.getSwitchStatus.invalidate();
            }
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });
    const setChannelMutation = trpc.updates.setChannel.useMutation({
        onMutate: (nextChannel) => {
            setFeedbackMessage(undefined);
            const previousChannelState = utils.updates.getChannel.getData(undefined);
            utils.updates.getChannel.setData(undefined, {
                channel: nextChannel,
            });
            return {
                previousChannelState,
            };
        },
        onSuccess: (result) => {
            utils.updates.getChannel.setData(undefined, {
                channel: result.channel,
            });
            setFeedbackTone(result.changed ? 'success' : 'info');
            setFeedbackMessage(result.message);
            if (result.checkStarted) {
                void utils.updates.getSwitchStatus.invalidate();
            }
        },
        onError: (error, _variables, context) => {
            if (context?.previousChannelState) {
                utils.updates.getChannel.setData(undefined, context.previousChannelState);
            }
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });
    const [pendingChannel, setPendingChannel] = useState<UpdateChannel | null>(null);

    const currentChannel = channelQuery.data?.channel ?? 'stable';

    const selectedMeta = CHANNEL_OPTIONS.find((option) => option.id === currentChannel);

    async function handleCheckForUpdates() {
        try {
            await checkMutation.mutateAsync();
        } catch {
            return;
        }
    }

    async function handleConfirmChannelSwitch() {
        if (!pendingChannel) {
            return;
        }

        try {
            await setChannelMutation.mutateAsync(pendingChannel);
        } catch {
            return;
        } finally {
            setPendingChannel(null);
        }
    }

    useEffect(() => {
        if (!open || !anchorRef?.current) {
            setPanelPosition(undefined);
            return;
        }

        const updatePosition = () => {
            const bounds = anchorRef.current?.getBoundingClientRect();
            if (!bounds) {
                return;
            }

            setPanelPosition({
                top: bounds.bottom + 8,
                left: Math.max(8, bounds.left),
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [anchorRef, open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        panelRef.current?.focus();

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }

            if (panelRef.current?.contains(target) || anchorRef?.current?.contains(target)) {
                return;
            }

            onClose();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            previousFocus?.focus();
        };
    }, [anchorRef, onClose, open]);

    if (!open) {
        return null;
    }

    return (
        <>
            <section
                ref={panelRef}
                role='dialog'
                aria-modal='false'
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                tabIndex={-1}
                className='border-border bg-card text-card-foreground fixed z-50 w-[320px] rounded-xl border p-3 shadow-xl outline-none'
                style={{
                    top: `${String(panelPosition?.top ?? 48)}px`,
                    left: `${String(panelPosition?.left ?? 8)}px`,
                }}>
                <div className='mb-2'>
                    <p id={titleId} className='text-xs font-semibold tracking-[0.12em] uppercase'>
                        Updates
                    </p>
                    <p id={descriptionId} className='text-muted-foreground mt-1 text-xs'>
                        Current: <span className='text-foreground font-medium'>{selectedMeta?.label ?? 'Stable'}</span>
                    </p>
                </div>

                {switchStatusQuery.data && switchStatusQuery.data.phase !== 'idle' ? (
                    <div
                        aria-live='polite'
                        className='border-border bg-background/70 mb-3 rounded-lg border px-3 py-2 text-xs'>
                        {switchStatusQuery.data.message}
                    </div>
                ) : null}
                {feedbackMessage ? (
                    <div
                        aria-live='polite'
                        className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
                            feedbackTone === 'error'
                                ? 'border-destructive/20 bg-destructive/10 text-destructive'
                                : feedbackTone === 'success'
                                  ? 'border-primary/20 bg-primary/10 text-primary'
                                  : 'border-border bg-background/70 text-muted-foreground'
                        }`}>
                        {feedbackMessage}
                    </div>
                ) : null}

                <div className='space-y-1.5'>
                    {CHANNEL_OPTIONS.map((channel) => {
                        const isCurrent = channel.id === currentChannel;
                        return (
                            <button
                                key={channel.id}
                                type='button'
                                className={`w-full rounded-md border px-2 py-2 text-left ${
                                    isCurrent
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border bg-background hover:bg-accent'
                                }`}
                                onClick={() => {
                                    if (isCurrent || setChannelMutation.isPending) {
                                        return;
                                    }

                                    setPendingChannel(channel.id);
                                }}>
                                <p className='text-sm font-medium'>{channel.label}</p>
                                <p className='text-muted-foreground text-xs'>{channel.description}</p>
                            </button>
                        );
                    })}
                </div>

                <div className='mt-3 flex justify-end'>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={checkMutation.isPending || switchStatusQuery.data?.canInteract === false}
                        onClick={() => {
                            void handleCheckForUpdates();
                        }}>
                        {checkMutation.isPending ? 'Checking...' : 'Check for updates'}
                    </Button>
                </div>
            </section>

            <ConfirmDialog
                open={pendingChannel !== null}
                title='Switch update channel?'
                message='Switching channels can move to newer or older builds and may affect in-progress features.'
                confirmLabel='Switch channel'
                cancelLabel='Cancel'
                destructive={pendingChannel === 'alpha'}
                busy={setChannelMutation.isPending}
                onCancel={() => {
                    if (setChannelMutation.isPending) {
                        return;
                    }

                    setPendingChannel(null);
                }}
                onConfirm={() => {
                    void handleConfirmChannelSwitch();
                }}
            />
        </>
    );
}
