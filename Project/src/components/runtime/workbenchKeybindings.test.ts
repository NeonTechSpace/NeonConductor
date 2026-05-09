import { describe, expect, it } from 'vitest';

import {
    findWorkbenchCommandForKeyboardEvent,
    formatWorkbenchKeybindingGesture,
    keyboardEventMatchesGesture,
} from '@/web/components/runtime/workbenchKeybindings';

describe('workbench keybindings', () => {
    it('matches mod keybindings by platform', () => {
        expect(
            keyboardEventMatchesGesture({
                event: { key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
                gesture: { key: 'k', mod: true },
                platform: 'other',
            })
        ).toBe(true);
        expect(
            keyboardEventMatchesGesture({
                event: { key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
                gesture: { key: 'k', mod: true },
                platform: 'mac',
            })
        ).toBe(false);
    });

    it('suppresses global shortcuts while editable text is focused', () => {
        const commandId = findWorkbenchCommandForKeyboardEvent({
            event: { key: 'k', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
            settings: undefined,
            context: {
                editableTextFocus: true,
                dialogOpen: false,
                settingsOpen: false,
            },
            platform: 'other',
        });

        expect(commandId).toBeUndefined();
    });

    it('resolves customized command settings before defaults', () => {
        const commandId = findWorkbenchCommandForKeyboardEvent({
            event: { key: 's', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
            settings: {
                updatedAt: '2026-05-09T00:00:00.000Z',
                keybindings: [
                    {
                        commandId: 'open_settings',
                        overrideKeybinding: { key: 's', mod: true },
                        effectiveKeybinding: { key: 's', mod: true },
                    },
                ],
            },
            context: {
                editableTextFocus: false,
                dialogOpen: false,
                settingsOpen: false,
            },
            platform: 'other',
        });

        expect(commandId).toBe('open_settings');
    });

    it('formats platform-specific shortcut labels', () => {
        expect(formatWorkbenchKeybindingGesture({ key: 'k', mod: true }, 'other')).toBe('Ctrl+K');
        expect(formatWorkbenchKeybindingGesture({ key: 'k', mod: true }, 'mac')).toBe('⌘K');
        expect(formatWorkbenchKeybindingGesture(undefined, 'other')).toBe('Unassigned');
    });
});
