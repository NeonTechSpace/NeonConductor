import { useDeferredValue, useId, useMemo, useRef, useState } from 'react';

import { DialogSurface } from '@/web/components/ui/dialogSurface';

import type { WorkspaceAppSection } from '@/web/components/runtime/workspaceSurfaceModel';

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

    const actions = useMemo<CommandAction[]>(() => {
        return [
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
                    onClose();
                },
            })),
            ...profiles.map((profile) => ({
                id: `profile:${profile.id}`,
                label: `Switch profile: ${profile.name}`,
                meta: profile.id,
                onSelect: () => {
                    onProfileChange(profile.id);
                    onClose();
                },
            })),
            ...workspaceOptions.map((workspace) => ({
                id: `workspace:${workspace.fingerprint}`,
                label: `Focus workspace: ${workspace.label}`,
                meta: workspace.fingerprint,
                onSelect: () => {
                    onWorkspaceChange(workspace.fingerprint);
                    onClose();
                },
            })),
        ];
    }, [appSection, onClose, onPreviewSectionChange, onProfileChange, onSectionChange, onWorkspaceChange, profiles, workspaceOptions]);

    const visibleActions = deferredQuery.length
        ? actions.filter((action) => `${action.label} ${action.meta}`.toLowerCase().includes(deferredQuery))
        : actions;

    return (
        <DialogSurface
            open={open}
            titleId={dialogTitleId}
            descriptionId={dialogDescriptionId}
            initialFocusRef={inputRef}
            onClose={() => {
                setQuery('');
                onClose();
            }}>
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
                        onChange={(event) => {
                            setQuery(event.target.value);
                        }}
                        className='border-border bg-card h-11 w-full rounded-2xl border px-3 text-sm'
                        autoComplete='off'
                        placeholder='Search commands, profiles, and workspaces…'
                    />

                    <div className='border-border bg-card/35 max-h-[50vh] overflow-y-auto rounded-2xl border p-2'>
                        {visibleActions.length > 0 ? (
                            <div className='space-y-1'>
                                {visibleActions.map((action) => (
                                    <button
                                        key={action.id}
                                        type='button'
                                        className='hover:bg-accent focus-visible:ring-ring w-full rounded-2xl px-3 py-2 text-left focus-visible:ring-2'
                                        onPointerEnter={'onPreview' in action ? action.onPreview : undefined}
                                        onFocus={'onPreview' in action ? action.onPreview : undefined}
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
