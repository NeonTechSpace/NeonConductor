import type { WorkspaceInspectorSection } from '@/web/components/conversation/sessions/workspaceShellModel';
import { Button } from '@/web/components/ui/button';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

interface WorkspaceInspectorProps {
    sections: WorkspaceInspectorSection[];
    activeSectionId?: WorkspaceInspectorSection['id'];
    onSelectSection: (sectionId: WorkspaceInspectorSection['id']) => void;
    onClose: () => void;
}

export function WorkspaceInspector({ sections, activeSectionId, onSelectSection, onClose }: WorkspaceInspectorProps) {
    const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

    function handleSectionKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
        if (!activeSection || sections.length === 0 || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) {
            return;
        }

        event.preventDefault();
        const currentIndex = Math.max(
            0,
            sections.findIndex((section) => section.id === activeSection.id)
        );
        const nextIndex =
            event.key === 'ArrowDown'
                ? (currentIndex + 1) % sections.length
                : (currentIndex - 1 + sections.length) % sections.length;
        const nextSection = sections[nextIndex];
        if (nextSection) {
            onSelectSection(nextSection.id);
        }
    }

    return (
        <aside className='border-border/70 bg-card/35 flex min-h-0 min-w-0 flex-col border-t lg:border-t-0 lg:border-l'>
            <div className='border-border/70 flex items-start justify-between gap-3 border-b px-4 py-4'>
                <div className='min-w-0'>
                    <p className='text-sm font-semibold'>Inspector</p>
                    <p className='text-muted-foreground text-xs'>
                        Secondary execution details stay here until you need them.
                    </p>
                </div>
                <Button type='button' size='sm' variant='outline' onClick={onClose}>
                    Hide
                </Button>
            </div>

            <div className='min-h-0 flex-1 overflow-y-auto p-4'>
                <div
                    className='mb-4 space-y-2'
                    role='tablist'
                    aria-label='Inspector sections'
                    onKeyDown={handleSectionKeyDown}>
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            type='button'
                            role='tab'
                            aria-selected={section.id === activeSection?.id}
                            aria-controls={`inspector-section-${section.id}`}
                            className={`border-border/70 flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-left text-xs ${
                                section.id === activeSection?.id ? 'bg-background text-foreground' : 'bg-background/50'
                            }`}
                            onClick={() => {
                                onSelectSection(section.id);
                            }}>
                            <span className='min-w-0 truncate font-medium'>{section.label}</span>
                            {section.badge ? (
                                <span
                                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                        section.tone === 'attention'
                                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                            : 'border-border bg-card text-muted-foreground'
                                    }`}>
                                    {section.badge}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>

                {activeSection ? (
                    <section
                        id={`inspector-section-${activeSection.id}`}
                        role='tabpanel'
                        className='border-border/70 bg-background/75 rounded-3xl border p-4'>
                        <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                                <p className='text-sm font-semibold'>{activeSection.label}</p>
                                <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                    {activeSection.description}
                                </p>
                            </div>
                            {activeSection.badge ? (
                                <span
                                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                        activeSection.tone === 'attention'
                                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                            : 'border-border bg-card text-muted-foreground'
                                    }`}>
                                    {activeSection.badge}
                                </span>
                            ) : null}
                        </div>
                        <div className='mt-4 min-w-0'>{activeSection.content}</div>
                    </section>
                ) : null}
            </div>
        </aside>
    );
}
