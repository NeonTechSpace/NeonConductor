import { useId, useRef, useState } from 'react';

import { useConversationSidebarState } from '@/web/components/conversation/hooks/useConversationSidebarState';
import { Button } from '@/web/components/ui/button';
import { DialogSurface } from '@/web/components/ui/dialogSurface';

import type { TopLevelTab } from '@/shared/contracts';

interface SidebarThreadComposerProps {
    topLevelTab: TopLevelTab;
    isCreatingThread: boolean;
    onCreateThread: (input: { scope: 'detached' | 'workspace'; workspacePath?: string; title: string }) => Promise<void>;
}

export function SidebarThreadComposer({
    topLevelTab,
    isCreatingThread,
    onCreateThread,
}: SidebarThreadComposerProps) {
    const {
        newThreadTitle,
        setNewThreadTitle,
        newThreadScope,
        setNewThreadScope,
        newThreadWorkspace,
        setNewThreadWorkspace,
        createThread,
    } = useConversationSidebarState({
        topLevelTab,
        isCreatingThread,
        onCreateThread,
    });
    const [isOpen, setIsOpen] = useState(false);
    const newThreadTitleInputRef = useRef<HTMLInputElement>(null);
    const dialogTitleId = useId();
    const dialogDescriptionId = useId();

    return (
        <>
            <Button
                type='button'
                size='sm'
                onClick={() => {
                    setIsOpen(true);
                }}>
                New
            </Button>

            <DialogSurface
                open={isOpen}
                titleId={dialogTitleId}
                descriptionId={dialogDescriptionId}
                initialFocusRef={newThreadTitleInputRef}
                onClose={() => {
                    setIsOpen(false);
                }}>
                <div className='border-border bg-background w-[min(92vw,28rem)] rounded-[28px] border p-5 shadow-xl'>
                    <div className='space-y-1'>
                        <h2 id={dialogTitleId} className='text-lg font-semibold'>
                            New thread
                        </h2>
                        <p id={dialogDescriptionId} className='text-muted-foreground text-sm'>
                            Create the thread here, then keep the rail focused on navigation.
                        </p>
                    </div>

                    <div className='mt-4 space-y-3'>
                        <input
                            ref={newThreadTitleInputRef}
                            aria-label='Thread title'
                            name='newThreadTitle'
                            value={newThreadTitle}
                            onChange={(event) => {
                                setNewThreadTitle(event.target.value);
                            }}
                            className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                            autoComplete='off'
                            placeholder='Optional thread title…'
                        />
                        <div className='grid grid-cols-2 gap-2'>
                            <select
                                aria-label='Thread scope'
                                className='border-border bg-card h-10 rounded-2xl border px-3 text-sm'
                                value={newThreadScope}
                                onChange={(event) => {
                                    setNewThreadScope(event.target.value === 'workspace' ? 'workspace' : 'detached');
                                }}>
                                <option value='detached'>Playground</option>
                                <option value='workspace'>Workspace</option>
                            </select>
                            <Button
                                type='button'
                                disabled={isCreatingThread || (newThreadScope === 'detached' && topLevelTab !== 'chat')}
                                onClick={() => {
                                    void createThread().then(() => {
                                        setIsOpen(false);
                                    });
                                }}>
                                Create thread
                            </Button>
                        </div>
                        {newThreadScope === 'workspace' ? (
                            <input
                                aria-label='Workspace path'
                                name='newThreadWorkspace'
                                value={newThreadWorkspace}
                                onChange={(event) => {
                                    setNewThreadWorkspace(event.target.value);
                                }}
                                className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                autoComplete='off'
                                placeholder='Workspace path…'
                            />
                        ) : null}
                        {newThreadScope === 'detached' && topLevelTab !== 'chat' ? (
                            <p className='text-muted-foreground text-xs'>Playground threads are only available in chat.</p>
                        ) : null}
                    </div>

                    <div className='mt-5 flex justify-end gap-2'>
                        <Button
                            type='button'
                            variant='ghost'
                            onClick={() => {
                                setIsOpen(false);
                            }}>
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogSurface>
        </>
    );
}
