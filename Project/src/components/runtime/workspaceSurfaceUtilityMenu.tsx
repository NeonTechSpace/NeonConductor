import { Command, Settings2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

import type { WorkspaceAppSection } from '@/web/components/runtime/workspaceSurfaceModel';
import { moveWorkspaceUtilityMenuHighlight } from '@/web/components/runtime/workspaceSurfaceUtilityMenuKeyboard';

interface WorkspaceSurfaceUtilityMenuProps {
    appSection: WorkspaceAppSection;
    onOpenSettings: () => void;
    onReturnToPrimarySection: () => void;
    onOpenCommandPalette: () => void;
}

function focusMenuItem(index: number, refs: Array<RefObject<HTMLButtonElement | null>>) {
    refs[index]?.current?.focus();
}

export function WorkspaceSurfaceUtilityMenu({
    appSection,
    onOpenSettings,
    onReturnToPrimarySection,
    onOpenCommandPalette,
}: WorkspaceSurfaceUtilityMenuProps) {
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const menuId = useId();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const settingsItemRef = useRef<HTMLButtonElement | null>(null);
    const commandPaletteItemRef = useRef<HTMLButtonElement | null>(null);
    const menuItemRefs = [settingsItemRef, commandPaletteItemRef];

    useEffect(() => {
        if (!open) {
            return;
        }
        setHighlightedIndex(0);
        requestAnimationFrame(() => {
            settingsItemRef.current?.focus();
        });

        const handlePointerDown = (event: MouseEvent) => {
            const targetNode = event.target;
            if (!(targetNode instanceof Node)) {
                return;
            }

            if (!containerRef.current?.contains(targetNode)) {
                setOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    return (
        <div ref={containerRef} className='relative shrink-0'>
            <button
                ref={triggerRef}
                type='button'
                aria-haspopup='menu'
                aria-expanded={open}
                {...(open ? { 'aria-controls': menuId } : {})}
                className={`border-border rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    appSection === 'settings'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'bg-card hover:bg-accent text-foreground'
                }`}
                onClick={() => {
                    setOpen((current) => !current);
                }}>
                App
            </button>

            {open ? (
                <div
                    id={menuId}
                    role='menu'
                    aria-label='App utilities'
                    onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                            event.preventDefault();
                            setHighlightedIndex((current) => {
                                const nextIndex = moveWorkspaceUtilityMenuHighlight({
                                    currentIndex: current,
                                    itemCount: menuItemRefs.length,
                                    direction: event.key === 'ArrowDown' ? 'next' : 'previous',
                                });
                                focusMenuItem(nextIndex, menuItemRefs);
                                return nextIndex;
                            });
                        }
                    }}
                    className='border-border bg-background absolute top-[calc(100%+0.5rem)] right-0 z-20 min-w-[220px] rounded-3xl border p-2 shadow-xl'>
                    <button
                        ref={settingsItemRef}
                        type='button'
                        role='menuitem'
                        data-highlighted={highlightedIndex === 0 ? 'true' : undefined}
                        className='hover:bg-accent flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors'
                        onFocus={() => {
                            setHighlightedIndex(0);
                        }}
                        onClick={() => {
                            if (appSection === 'settings') {
                                onReturnToPrimarySection();
                            } else {
                                onOpenSettings();
                            }
                            setOpen(false);
                        }}>
                        <Settings2 className='mt-0.5 size-4 shrink-0' />
                        <span className='space-y-1'>
                            <span className='block text-sm font-medium'>
                                {appSection === 'settings' ? 'Return to Sessions' : 'Open Settings'}
                            </span>
                            <span className='text-muted-foreground block text-xs leading-5'>
                                {appSection === 'settings'
                                    ? 'Return to the last primary workspace area.'
                                    : 'Open settings for providers, profiles, workspace limits, rules, skills, and app tools.'}
                            </span>
                        </span>
                    </button>

                    <button
                        ref={commandPaletteItemRef}
                        type='button'
                        role='menuitem'
                        data-highlighted={highlightedIndex === 1 ? 'true' : undefined}
                        className='hover:bg-accent flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors'
                        onFocus={() => {
                            setHighlightedIndex(1);
                        }}
                        onClick={() => {
                            onOpenCommandPalette();
                            setOpen(false);
                        }}>
                        <Command className='mt-0.5 size-4 shrink-0' />
                        <span className='space-y-1'>
                            <span className='block text-sm font-medium'>Open Command Palette</span>
                            <span className='text-muted-foreground block text-xs leading-5'>
                                Jump between workspaces, profiles, and surfaces with the keyboard.
                            </span>
                        </span>
                    </button>
                </div>
            ) : null}
        </div>
    );
}
