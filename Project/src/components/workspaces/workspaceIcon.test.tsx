import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorkspaceIcon } from '@/web/components/workspaces/workspaceIcon';
import {
    buildWorkspaceIconImageSource,
    formatWorkspaceIconState,
} from '@/web/components/workspaces/workspaceIconModel';

describe('WorkspaceIcon', () => {
    it('formats manual, detected, and fallback icon states', () => {
        expect(formatWorkspaceIconState({ kind: 'manual', updatedAt: '2026-01-01T00:00:00.000Z' })).toBe('Manual icon');
        expect(
            formatWorkspaceIconState({
                kind: 'detected',
                sourceKind: 'well_known_file',
                detectedRelativePath: 'public/favicon.ico',
                updatedAt: '2026-01-01T00:00:00.000Z',
            })
        ).toBe('Detected from public/favicon.ico');
        expect(formatWorkspaceIconState({ kind: 'fallback', updatedAt: '2026-01-01T00:00:00.000Z' })).toBe(
            'Fallback icon'
        );
    });

    it('builds the route-served workspace icon source', () => {
        expect(
            buildWorkspaceIconImageSource({
                profileId: 'profile default',
                workspaceFingerprint: 'ws/alpha',
                updatedAt: '2026-01-01T00:00:00.000Z',
            })
        ).toBe('neon-workspace-icon://workspace-root-icon/profile%20default/ws%2Falpha?v=2026-01-01T00%3A00%3A00.000Z');
    });

    it('renders detected icons as route-served images and fallback icons as folder UI', () => {
        const detectedHtml = renderToStaticMarkup(
            <WorkspaceIcon
                profileId='profile_default'
                workspaceFingerprint='ws_alpha'
                label='Alpha'
                summary={{
                    kind: 'detected',
                    sourceKind: 'well_known_file',
                    detectedRelativePath: 'favicon.ico',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                }}
            />
        );
        expect(detectedHtml).toContain('neon-workspace-icon://workspace-root-icon/profile_default/ws_alpha');
        expect(detectedHtml).toContain('Detected from favicon.ico');

        const fallbackHtml = renderToStaticMarkup(
            <WorkspaceIcon
                profileId='profile_default'
                workspaceFingerprint='ws_alpha'
                label='Alpha'
                summary={{
                    kind: 'fallback',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                }}
            />
        );
        expect(fallbackHtml).toContain('Fallback icon');
        expect(fallbackHtml).not.toContain('<img');
    });
});
