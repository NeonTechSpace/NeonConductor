import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceInspector } from '@/web/components/conversation/sessions/workspaceInspector';
import type { WorkspaceInspectorSection } from '@/web/components/conversation/sessions/workspaceShellModel';

const inspectorSections: WorkspaceInspectorSection[] = [
    {
        id: 'workspace-status',
        label: 'Status',
        description: 'Workspace status details.',
        content: createElement('p', undefined, 'status content'),
    },
    {
        id: 'pending-permissions',
        label: 'Permissions',
        description: 'Pending permission requests.',
        badge: '2',
        tone: 'attention',
        content: createElement('p', undefined, 'permission content'),
    },
    {
        id: 'execution-receipt',
        label: 'Receipt',
        description: 'Execution receipt details.',
        content: createElement('p', undefined, 'receipt content'),
    },
];

describe('WorkspaceInspector', () => {
    it('renders a selectable section surface with active content and badges', () => {
        const html = renderToStaticMarkup(
            createElement(WorkspaceInspector, {
                sections: inspectorSections,
                activeSectionId: 'pending-permissions',
                onSelectSection: vi.fn(),
                onClose: vi.fn(),
            })
        );

        expect(html).toContain('role="tablist"');
        expect(html).toContain('aria-selected="true"');
        expect(html).toContain('aria-controls="inspector-section-pending-permissions"');
        expect(html).toContain('role="tabpanel"');
        expect(html).toContain('permission content');
        expect(html).toContain('2');
        expect(html).not.toContain('status content');
        expect(html).not.toContain('receipt content');
    });

    it('falls back to the first available section when the active section disappears', () => {
        const html = renderToStaticMarkup(
            createElement(WorkspaceInspector, {
                sections: inspectorSections,
                activeSectionId: 'memory',
                onSelectSection: vi.fn(),
                onClose: vi.fn(),
            })
        );

        expect(html).toContain('status content');
        expect(html).not.toContain('permission content');
    });
});
