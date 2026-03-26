import { useState } from 'react';

import { WorkspaceInspector } from '@/web/components/conversation/sessions/workspaceInspector';
import type { WorkspaceInspectorSection } from '@/web/components/conversation/sessions/workspaceShellModel';

import type { ReactNode } from 'react';

interface WorkspaceShellProps {
    inspectorSections: WorkspaceInspectorSection[];
    renderHeader: (input: { isInspectorOpen: boolean; toggleInspector: () => void }) => ReactNode;
    children: ReactNode;
}

export function WorkspaceShell({ inspectorSections, renderHeader, children }: WorkspaceShellProps) {
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);

    return (
        <div
            className={`grid min-h-0 min-w-0 flex-1 ${isInspectorOpen ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-1'}`}>
            <div className='flex min-h-0 min-w-0 flex-col overflow-hidden'>
                {renderHeader({
                    isInspectorOpen,
                    toggleInspector: () => {
                        setIsInspectorOpen((current) => !current);
                    },
                })}
                {children}
            </div>

            {isInspectorOpen ? (
                <WorkspaceInspector
                    sections={inspectorSections}
                    onClose={() => {
                        setIsInspectorOpen(false);
                    }}
                />
            ) : null}
        </div>
    );
}
