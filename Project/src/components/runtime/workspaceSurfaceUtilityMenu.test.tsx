import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceSurfaceUtilityMenu } from '@/web/components/runtime/workspaceSurfaceUtilityMenu';
import { moveWorkspaceUtilityMenuHighlight } from '@/web/components/runtime/workspaceSurfaceUtilityMenuKeyboard';

describe('workspace surface utility menu', () => {
    it('renders the trigger as a menu button with closed state metadata', () => {
        const html = renderToStaticMarkup(
            <WorkspaceSurfaceUtilityMenu
                appSection='sessions'
                onOpenSettings={vi.fn()}
                onReturnToPrimarySection={vi.fn()}
                onOpenCommandPalette={vi.fn()}
            />
        );

        expect(html).toContain('aria-haspopup="menu"');
        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain('App');
    });

    it('moves menu highlight predictably through available actions', () => {
        expect(
            moveWorkspaceUtilityMenuHighlight({
                currentIndex: 0,
                itemCount: 2,
                direction: 'next',
            })
        ).toBe(1);
        expect(
            moveWorkspaceUtilityMenuHighlight({
                currentIndex: 1,
                itemCount: 2,
                direction: 'next',
            })
        ).toBe(0);
        expect(
            moveWorkspaceUtilityMenuHighlight({
                currentIndex: 0,
                itemCount: 2,
                direction: 'previous',
            })
        ).toBe(1);
        expect(
            moveWorkspaceUtilityMenuHighlight({
                currentIndex: 0,
                itemCount: 0,
                direction: 'next',
            })
        ).toBe(-1);
    });
});
