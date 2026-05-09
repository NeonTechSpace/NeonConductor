import { describe, expect, it, vi } from 'vitest';

import {
    buildWorkbenchPaletteCommands,
    filterWorkbenchPaletteCommands,
} from '@/web/components/runtime/workbenchCommandRegistry';

describe('workbench command registry', () => {
    it('exposes navigation commands before profile and workspace commands', () => {
        const onCommand = vi.fn();
        const commands = buildWorkbenchPaletteCommands({
            appSection: 'sessions',
            profiles: [{ id: 'profile_default', name: 'Default' }],
            workspaceOptions: [{ fingerprint: 'workspace-alpha', label: 'Alpha' }],
            onCommand,
            onProfileChange: vi.fn(),
            onWorkspaceChange: vi.fn(),
        });

        expect(commands.map((command) => command.id)).toEqual([
            'command:go_sessions',
            'command:open_settings',
            'profile:profile_default',
            'workspace:workspace-alpha',
        ]);

        commands[1]?.onSelect();

        expect(onCommand).toHaveBeenCalledWith('open_settings');
    });

    it('filters commands by label or metadata', () => {
        const commands = buildWorkbenchPaletteCommands({
            appSection: 'settings',
            profiles: [{ id: 'profile_default', name: 'Default' }],
            workspaceOptions: [{ fingerprint: 'workspace-alpha', label: 'Alpha' }],
            onCommand: vi.fn(),
            onProfileChange: vi.fn(),
            onWorkspaceChange: vi.fn(),
        });

        expect(filterWorkbenchPaletteCommands(commands, 'settings').map((command) => command.id)).toEqual([
            'command:open_settings',
        ]);
        expect(filterWorkbenchPaletteCommands(commands, 'workspace-alpha').map((command) => command.id)).toEqual([
            'workspace:workspace-alpha',
        ]);
    });
});
