import {
    workbenchCommandDefinitions,
    type WorkbenchCommandId,
    type WorkbenchCommandSettings,
    type WorkbenchKeybindingGesture,
} from '@/shared/contracts';

export type WorkbenchPlatform = 'mac' | 'other';

export interface WorkbenchKeybindingContext {
    editableTextFocus: boolean;
    dialogOpen: boolean;
    settingsOpen: boolean;
}

export function getWorkbenchPlatform(): WorkbenchPlatform {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/u.test(navigator.platform) ? 'mac' : 'other';
}

export function isWorkbenchEditableTarget(target: EventTarget | null): boolean {
    return (
        typeof HTMLElement !== 'undefined' &&
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
    );
}

export function buildWorkbenchKeybindingContext(input: {
    eventTarget: EventTarget | null;
    dialogOpen: boolean;
    settingsOpen: boolean;
}): WorkbenchKeybindingContext {
    return {
        editableTextFocus: isWorkbenchEditableTarget(input.eventTarget),
        dialogOpen: input.dialogOpen,
        settingsOpen: input.settingsOpen,
    };
}

export function commandCanRunInContext(input: {
    commandId: WorkbenchCommandId;
    context: WorkbenchKeybindingContext;
}): boolean {
    if (input.context.editableTextFocus) {
        return false;
    }

    if (input.context.dialogOpen && input.commandId !== 'open_command_palette') {
        return false;
    }

    return true;
}

function getDefaultKeybinding(
    definition: (typeof workbenchCommandDefinitions)[number]
): WorkbenchKeybindingGesture | undefined {
    return 'defaultKeybinding' in definition ? definition.defaultKeybinding : undefined;
}

export function getEffectiveWorkbenchKeybindings(
    settings: WorkbenchCommandSettings | undefined
): Array<{ commandId: WorkbenchCommandId; gesture: WorkbenchKeybindingGesture }> {
    const keybindings: Array<{ commandId: WorkbenchCommandId; gesture: WorkbenchKeybindingGesture }> = [];

    if (settings) {
        for (const keybinding of settings.keybindings) {
            if (keybinding.effectiveKeybinding) {
                keybindings.push({
                    commandId: keybinding.commandId,
                    gesture: keybinding.effectiveKeybinding,
                });
            }
        }
        return keybindings;
    }

    for (const definition of workbenchCommandDefinitions) {
        const defaultKeybinding = getDefaultKeybinding(definition);
        if (defaultKeybinding) {
            keybindings.push({
                commandId: definition.id,
                gesture: defaultKeybinding,
            });
        }
    }

    return keybindings;
}

export function keyboardEventMatchesGesture(input: {
    event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;
    gesture: WorkbenchKeybindingGesture;
    platform: WorkbenchPlatform;
}): boolean {
    const normalizedKey = input.event.key === ' ' ? 'space' : input.event.key.toLowerCase();
    const modPressed = input.platform === 'mac' ? input.event.metaKey : input.event.ctrlKey;

    return (
        normalizedKey === input.gesture.key.toLowerCase() &&
        Boolean(input.gesture.mod) === modPressed &&
        Boolean(input.gesture.shift) === input.event.shiftKey &&
        Boolean(input.gesture.alt) === input.event.altKey
    );
}

export function findWorkbenchCommandForKeyboardEvent(input: {
    event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;
    settings: WorkbenchCommandSettings | undefined;
    context: WorkbenchKeybindingContext;
    platform: WorkbenchPlatform;
}): WorkbenchCommandId | undefined {
    return getEffectiveWorkbenchKeybindings(input.settings).find((keybinding) => {
        if (!commandCanRunInContext({ commandId: keybinding.commandId, context: input.context })) {
            return false;
        }

        return keyboardEventMatchesGesture({
            event: input.event,
            gesture: keybinding.gesture,
            platform: input.platform,
        });
    })?.commandId;
}

export function formatWorkbenchKeybindingGesture(
    gesture: WorkbenchKeybindingGesture | undefined,
    platform: WorkbenchPlatform = getWorkbenchPlatform()
): string {
    if (!gesture) {
        return 'Unassigned';
    }

    const parts = [
        gesture.mod ? (platform === 'mac' ? '⌘' : 'Ctrl') : undefined,
        gesture.shift ? 'Shift' : undefined,
        gesture.alt ? (platform === 'mac' ? '⌥' : 'Alt') : undefined,
        gesture.key.length === 1 ? gesture.key.toUpperCase() : gesture.key,
    ].filter((part): part is string => Boolean(part));

    return parts.join(platform === 'mac' ? '' : '+');
}
