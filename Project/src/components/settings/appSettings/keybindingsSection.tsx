import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { formatWorkbenchKeybindingGesture } from '@/web/components/runtime/workbenchKeybindings';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { Button } from '@/web/components/ui/button';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import {
    workbenchCommandDefinitions,
    type WorkbenchCommandId,
    type WorkbenchCommandSettings,
    type WorkbenchKeybindingGesture,
    type WorkbenchKeybindingOverrides,
} from '@/shared/contracts';

function gestureFromKeyboardEvent(event: ReactKeyboardEvent): WorkbenchKeybindingGesture | undefined {
    const key = event.key === ' ' ? 'space' : event.key.toLowerCase();
    if (key.length !== 1 && !['escape', 'enter', 'tab', 'space'].includes(key)) {
        return undefined;
    }

    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        return undefined;
    }

    return {
        key,
        ...(event.metaKey || event.ctrlKey ? { mod: true } : {}),
        ...(event.shiftKey ? { shift: true } : {}),
        ...(event.altKey ? { alt: true } : {}),
    };
}

function readOverrides(settings: WorkbenchCommandSettings | undefined): WorkbenchKeybindingOverrides {
    const overrides: WorkbenchKeybindingOverrides = {};
    for (const keybinding of settings?.keybindings ?? []) {
        if (keybinding.overrideKeybinding !== undefined) {
            overrides[keybinding.commandId] = keybinding.overrideKeybinding;
        }
    }
    return overrides;
}

export function KeybindingsSettingsSection() {
    const utils = trpc.useUtils();
    const [recordingCommandId, setRecordingCommandId] = useState<WorkbenchCommandId | undefined>(undefined);
    const [draftError, setDraftError] = useState<string | undefined>(undefined);
    const settingsQuery = trpc.workbench.getCommandSettings.useQuery();
    const setOverridesMutation = trpc.workbench.setCommandKeybindingOverrides.useMutation({
        onSuccess: (data) => {
            utils.workbench.getCommandSettings.setData(undefined, data);
            setDraftError(undefined);
            setRecordingCommandId(undefined);
        },
        onError: (error) => {
            setDraftError(error.message);
        },
    });
    const resetMutation = trpc.workbench.resetCommandKeybindings.useMutation({
        onSuccess: (data) => {
            utils.workbench.getCommandSettings.setData(undefined, data);
            setDraftError(undefined);
            setRecordingCommandId(undefined);
        },
        onError: (error) => {
            setDraftError(error.message);
        },
    });
    const settings = settingsQuery.data?.settings;
    const keybindingsByCommandId = new Map(
        settings?.keybindings.map((keybinding) => [keybinding.commandId, keybinding])
    );
    const feedbackMessage = draftError ?? settingsQuery.error?.message;
    const isBusy = setOverridesMutation.isPending || resetMutation.isPending;

    const saveOverride = createFailClosedAsyncAction(
        async (commandId: WorkbenchCommandId, gesture: WorkbenchKeybindingGesture | null) => {
            await setOverridesMutation.mutateAsync({
                overrides: {
                    ...readOverrides(settings),
                    [commandId]: gesture,
                },
            });
        }
    );

    function handleRecordingKeyDown(event: ReactKeyboardEvent, commandId: WorkbenchCommandId) {
        if (recordingCommandId !== commandId) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.key === 'Escape') {
            setRecordingCommandId(undefined);
            setDraftError(undefined);
            return;
        }

        const gesture = gestureFromKeyboardEvent(event);
        if (!gesture) {
            setDraftError('Use a letter or supported named key with at least one modifier.');
            return;
        }

        void saveOverride(commandId, gesture);
    }

    return (
        <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
            <SettingsFeedbackBanner
                message={feedbackMessage}
                tone={feedbackMessage ? 'error' : settingsQuery.isLoading ? 'info' : 'success'}
            />
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Workbench keybindings</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Shortcuts trigger the same visible workbench actions as buttons and menus. They do not grant runtime
                    authority or bypass approvals.
                </p>
            </div>

            <div className='space-y-2'>
                {workbenchCommandDefinitions.map((command) => {
                    const keybinding = keybindingsByCommandId.get(command.id);
                    const isRecording = recordingCommandId === command.id;
                    return (
                        <div
                            key={command.id}
                            tabIndex={isRecording ? 0 : -1}
                            onKeyDown={(event) => {
                                handleRecordingKeyDown(event, command.id);
                            }}
                            className='border-border/70 bg-background/70 grid gap-3 rounded-2xl border px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]'>
                            <div className='min-w-0 space-y-1'>
                                <p className='font-medium'>{command.label}</p>
                                <p className='text-muted-foreground text-xs leading-5'>{command.description}</p>
                                <p className='text-muted-foreground text-xs'>
                                    Current:{' '}
                                    <span className='text-foreground font-medium'>
                                        {formatWorkbenchKeybindingGesture(keybinding?.effectiveKeybinding)}
                                    </span>
                                </p>
                            </div>
                            <div className='flex flex-wrap items-center justify-end gap-2'>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant={isRecording ? 'secondary' : 'outline'}
                                    disabled={isBusy || !command.editableKeybinding}
                                    onClick={() => {
                                        setRecordingCommandId(isRecording ? undefined : command.id);
                                        setDraftError(undefined);
                                    }}>
                                    {isRecording ? 'Press shortcut' : 'Edit'}
                                </Button>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='ghost'
                                    disabled={isBusy || !keybinding?.effectiveKeybinding}
                                    onClick={() => {
                                        void saveOverride(command.id, null);
                                    }}>
                                    Unassign
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className='flex justify-end'>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isBusy}
                    onClick={() => {
                        void resetMutation.mutateAsync();
                    }}>
                    Reset keybindings
                </Button>
            </div>
        </section>
    );
}
