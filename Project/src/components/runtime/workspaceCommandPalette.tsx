import { useDeferredValue, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import {
    buildWorkbenchPaletteCommands,
    filterWorkbenchPaletteCommands,
} from '@/web/components/runtime/workbenchCommandRegistry';
import { moveWorkspaceCommandPaletteHighlight } from '@/web/components/runtime/workspaceCommandPaletteKeyboard';
import type { WorkspaceAppSection } from '@/web/components/runtime/workspaceSurfaceModel';
import { DialogSurface } from '@/web/components/ui/dialogSurface';
import { WorkspaceIcon } from '@/web/components/workspaces/workspaceIcon';

import type { WorkbenchCommandId, WorkspaceIconSummary } from '@/shared/contracts';

interface WorkspaceCommandPaletteProps {
    open: boolean;
    profileId: string;
    appSection: WorkspaceAppSection;
    profiles: Array<{ id: string; name: string }>;
    workspaceOptions: Array<{ fingerprint: string; label: string; workspaceIconSummary?: WorkspaceIconSummary }>;
    onClose: () => void;
    onCommand: (commandId: WorkbenchCommandId) => void;
    onPreviewSectionChange?: (section: WorkspaceAppSection) => void;
    onProfileChange: (profileId: string) => void;
    onWorkspaceChange: (workspaceFingerprint: string | undefined) => void;
}

export function WorkspaceCommandPalette({
    open,
    profileId,
    appSection,
    profiles,
    workspaceOptions,
    onClose,
    onCommand,
    onPreviewSectionChange,
    onProfileChange,
    onWorkspaceChange,
}: WorkspaceCommandPaletteProps) {
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query.trim().toLowerCase());
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();
    const listboxId = useId();
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const actions = buildWorkbenchPaletteCommands({
        appSection,
        profiles,
        workspaceOptions,
        onCommand,
        ...(onPreviewSectionChange ? { onPreviewSectionChange } : {}),
        onProfileChange,
        onWorkspaceChange,
    });
    const visibleActions = filterWorkbenchPaletteCommands(actions, deferredQuery);
    const activeDescendantId =
        visibleActions.length > 0 && highlightedIndex >= 0
            ? `${listboxId}-option-${String(highlightedIndex)}`
            : undefined;

    useEffect(() => {
        setHighlightedIndex((current) => {
            if (visibleActions.length === 0) {
                return -1;
            }
            return current >= 0 && current < visibleActions.length ? current : 0;
        });
    }, [visibleActions.length]);

    function closePalette() {
        setQuery('');
        setHighlightedIndex(0);
        onClose();
    }

    function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlightedIndex((current) =>
                moveWorkspaceCommandPaletteHighlight({
                    currentIndex: current,
                    itemCount: visibleActions.length,
                    direction: 'next',
                })
            );
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightedIndex((current) =>
                moveWorkspaceCommandPaletteHighlight({
                    currentIndex: current,
                    itemCount: visibleActions.length,
                    direction: 'previous',
                })
            );
            return;
        }
        if (event.key === 'Enter') {
            const selectedAction = visibleActions[highlightedIndex];
            if (!selectedAction) {
                return;
            }
            event.preventDefault();
            void Promise.resolve(selectedAction.onSelect()).then(closePalette);
        }
    }

    return (
        <DialogSurface
            open={open}
            titleId={dialogTitleId}
            descriptionId={dialogDescriptionId}
            initialFocusRef={inputRef}
            onClose={closePalette}>
            <div className='border-border bg-background w-[min(92vw,40rem)] rounded-[28px] border p-5 shadow-xl'>
                <div className='space-y-1'>
                    <h2 id={dialogTitleId} className='text-lg font-semibold'>
                        Command palette
                    </h2>
                    <p id={dialogDescriptionId} className='text-muted-foreground text-sm'>
                        Jump between sections, profiles, and workspaces without leaving the keyboard.
                    </p>
                </div>

                <div className='mt-4 space-y-3'>
                    <input
                        ref={inputRef}
                        type='search'
                        value={query}
                        aria-controls={listboxId}
                        {...(activeDescendantId ? { 'aria-activedescendant': activeDescendantId } : {})}
                        onChange={(event) => {
                            setQuery(event.target.value);
                        }}
                        onKeyDown={handleInputKeyDown}
                        className='border-border bg-card h-11 w-full rounded-2xl border px-3 text-sm'
                        autoComplete='off'
                        placeholder='Search commands, profiles, and workspaces…'
                    />

                    <div
                        id={listboxId}
                        role='listbox'
                        aria-label='Command palette results'
                        className='border-border bg-card/35 max-h-[50vh] overflow-y-auto rounded-2xl border p-2'>
                        {visibleActions.length > 0 ? (
                            <div className='space-y-1'>
                                {visibleActions.map((action, index) => (
                                    <button
                                        key={action.id}
                                        id={`${listboxId}-option-${String(index)}`}
                                        type='button'
                                        role='option'
                                        aria-selected={index === highlightedIndex}
                                        className='hover:bg-accent focus-visible:ring-ring w-full rounded-2xl px-3 py-2 text-left focus-visible:ring-2'
                                        onPointerEnter={() => {
                                            setHighlightedIndex(index);
                                            action.onPreview?.();
                                        }}
                                        onFocus={() => {
                                            setHighlightedIndex(index);
                                            action.onPreview?.();
                                        }}
                                        onClick={() => {
                                            void Promise.resolve(action.onSelect()).then(closePalette);
                                        }}>
                                        <div className='flex min-w-0 items-center gap-2'>
                                            {'workspace' in action && action.workspace.workspaceIconSummary ? (
                                                <WorkspaceIcon
                                                    profileId={profileId}
                                                    workspaceFingerprint={action.workspace.fingerprint}
                                                    summary={action.workspace.workspaceIconSummary}
                                                    label={action.workspace.label}
                                                    className='h-7 w-7 rounded-md'
                                                />
                                            ) : null}
                                            <div className='min-w-0'>
                                                <p className='truncate text-sm font-medium'>{action.label}</p>
                                                <p className='text-muted-foreground truncate text-xs'>{action.meta}</p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className='text-muted-foreground px-3 py-6 text-sm'>No matching actions yet.</p>
                        )}
                    </div>
                </div>
            </div>
        </DialogSurface>
    );
}
