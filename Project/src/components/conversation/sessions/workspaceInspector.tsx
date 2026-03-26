import type { WorkspaceInspectorSection } from '@/web/components/conversation/sessions/workspaceShellModel';
import { Button } from '@/web/components/ui/button';


interface WorkspaceInspectorProps {
    sections: WorkspaceInspectorSection[];
    onClose: () => void;
}

export function WorkspaceInspector({ sections, onClose }: WorkspaceInspectorProps) {
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
                <div className='space-y-4'>
                    {sections.map((section) => (
                        <section key={section.id} className='border-border/70 bg-background/75 rounded-3xl border p-4'>
                            <div className='flex items-start justify-between gap-3'>
                                <div className='min-w-0'>
                                    <p className='text-sm font-semibold'>{section.label}</p>
                                    <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                        {section.description}
                                    </p>
                                </div>
                                {section.badge ? (
                                    <span
                                        className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                            section.tone === 'attention'
                                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                                                : 'border-border bg-card text-muted-foreground'
                                        }`}>
                                        {section.badge}
                                    </span>
                                ) : null}
                            </div>
                            <div className='mt-4 min-w-0'>{section.content}</div>
                        </section>
                    ))}
                </div>
            </div>
        </aside>
    );
}
