import { describe, expect, it } from 'vitest';

import { createCaller, registerRuntimeContractHooks } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: workbench command settings', () => {
    it('seeds default command keybindings and persists overrides', async () => {
        const caller = createCaller();

        const initial = await caller.workbench.getCommandSettings();
        expect(initial.settings.keybindings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    commandId: 'open_command_palette',
                    defaultKeybinding: { key: 'k', mod: true },
                    effectiveKeybinding: { key: 'k', mod: true },
                }),
                expect.objectContaining({
                    commandId: 'go_sessions',
                }),
            ])
        );

        const updated = await caller.workbench.setCommandKeybindingOverrides({
            overrides: {
                go_sessions: { key: '1', mod: true },
                open_settings: { key: '2', mod: true },
            },
        });
        expect(updated.settings.keybindings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    commandId: 'go_sessions',
                    overrideKeybinding: { key: '1', mod: true },
                    effectiveKeybinding: { key: '1', mod: true },
                }),
                expect.objectContaining({
                    commandId: 'open_settings',
                    overrideKeybinding: { key: '2', mod: true },
                    effectiveKeybinding: { key: '2', mod: true },
                }),
            ])
        );

        const reread = await caller.workbench.getCommandSettings();
        expect(reread.settings.keybindings).toEqual(updated.settings.keybindings);
    });

    it('resets command keybindings to the shared defaults', async () => {
        const caller = createCaller();

        await caller.workbench.setCommandKeybindingOverrides({
            overrides: {
                open_command_palette: null,
                open_settings: { key: '2', mod: true },
            },
        });

        const reset = await caller.workbench.resetCommandKeybindings();
        const openPaletteKeybinding = reset.settings.keybindings.find(
            (keybinding) => keybinding.commandId === 'open_command_palette'
        );

        expect(openPaletteKeybinding).toEqual(
            expect.objectContaining({
                commandId: 'open_command_palette',
                effectiveKeybinding: { key: 'k', mod: true },
            })
        );
        expect(openPaletteKeybinding).not.toHaveProperty('overrideKeybinding');
    });

    it('rejects unknown, bare, and conflicting command keybindings', async () => {
        const caller = createCaller();

        await expect(
            caller.workbench.setCommandKeybindingOverrides({
                overrides: {
                    missing_command: { key: 'm', mod: true },
                },
            } as never)
        ).rejects.toThrow('Invalid "overrides.missing_command"');

        await expect(
            caller.workbench.setCommandKeybindingOverrides({
                overrides: {
                    open_settings: { key: 's' },
                },
            })
        ).rejects.toThrow('keybindings require at least one modifier');

        await expect(
            caller.workbench.setCommandKeybindingOverrides({
                overrides: {
                    open_command_palette: { key: '1', mod: true },
                    go_sessions: { key: '1', mod: true },
                },
            })
        ).rejects.toThrow('Keybinding conflict');
    });
});
