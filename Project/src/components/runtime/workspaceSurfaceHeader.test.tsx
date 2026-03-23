import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/window/privacyModeToggle', () => ({
    default: () => <div>privacy toggle</div>,
}));

import { WorkspaceSurfaceHeader } from '@/web/components/runtime/workspaceSurfaceHeader';

describe('workspace surface header', () => {
    it('keeps settings in the public header without exposing a sessions back button', () => {
        const html = renderToStaticMarkup(
            <WorkspaceSurfaceHeader
                appSection='sessions'
                profiles={[{ id: 'profile_default', name: 'Local Default' }]}
                resolvedProfileId='profile_default'
                isSwitchingProfile={false}
                onProfileChange={vi.fn()}
                onOpenSettings={vi.fn()}
                onOpenCommandPalette={vi.fn()}
            />
        );

        expect(html).toContain('NeonConductor');
        expect(html).toContain('Local Default');
        expect(html).toContain('Search');
        expect(html).toContain('Open settings');
        expect(html).not.toContain('Return to sessions');
        expect(html).not.toContain('Sessions');
        expect(html).not.toContain('All workspaces');
        expect(html).not.toContain('Workspaces');
        expect(html).not.toContain('App');
        expect(html).not.toContain('Chat');
        expect(html).not.toContain('Agent');
        expect(html).not.toContain('Orchestrator');
    });
});
