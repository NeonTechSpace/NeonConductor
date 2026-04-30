import { useDeferredValue, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { moveWorkspaceCommandPaletteHighlight } from '@/web/components/runtime/workspaceCommandPaletteKeyboard';
import type { WorkspaceAppSection } from '@/web/components/runtime/workspaceSurfaceModel';
import { DialogSurface } from '@/web/components/ui/dialogSurface';

interface WorkspaceCommandPaletteProps {
    open: boolean;
    appSection: WorkspaceAppSection;
    profiles: Array<{ id: string; name: string }>;
    workspaceOptions: Array<{ fingerprint: string; label: string }>;
    onClose: () => void;
    onSectionChange: (section: WorkspaceAppSection) => void;
    onPreviewSectionChange?: (section: WorkspaceAppSection) => void;
    onProfileChange: (profileId: string) => void;
    onWorkspaceChange: (workspaceFingerprint: string | undefined) => void;
}

type CommandAction =
    | { id: string; label: string; meta: string; onSelect: () => void; onPreview?: () => void }
    | { id: string; label: string; meta: string; onSelect: () => Promise<void>; onPreview?: () => void };

const APP_ACTIONS: Array<{ id: WorkspaceAppSection; label: string }> = [
    { id: 'sessions', label: 'Go to Sessions' },
    { id: 'settings', label: 'Open Settings' },
];

export function WorkspaceCommandPalette({
    open,
    appSection,
    profiles,
    workspaceOptions,
    onClose,
    onSectionChange,
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

    const actions: CommandAction[] = [
        ...APP_ACTIONS.map((action) => ({
            id: `section:${action.id}`,
            label: action.label,
            meta: action.id === appSection ? 'Current section' : 'Application section',
            ...(onPreviewSectionChange
                ? {
                      onPreview: () => {
                          onPreviewSectionChange(action.id);
                      },
                  }
                : {}),
            onSelect: () => {
                onSectionChange(action.id);
                closePalette();
            },
        })),
        ...profiles.map((profile) => ({
            id: `profile:${profile.id}`,
            label: `Switch profile: ${profile.name}`,
            meta: profile.id,
            onSelect: () => {
                onProfileChange(profile.id);
                closePalette();
            },
        })),
        ...workspaceOptions.map((workspace) => ({
            id: `workspace:${workspace.fingerprint}`,
            label: `Focus workspace: ${workspace.label}`,
            meta: workspace.fingerprint,
            onSelect: () => {
                onWorkspaceChange(workspace.fingerprint);
                closePalette();
            },
        })),
    ];

    const visibleActions = deferredQuery.length
        ? actions.filter((action) => `${action.label} ${action.meta}`.toLowerCase().includes(deferredQuery))
        : actions;
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
            void selectedAction.onSelect();
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
                                            void action.onSelect();
                                        }}>
                                        <p className='text-sm font-medium'>{action.label}</p>
                                        <p className='text-muted-foreground text-xs'>{action.meta}</p>
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
