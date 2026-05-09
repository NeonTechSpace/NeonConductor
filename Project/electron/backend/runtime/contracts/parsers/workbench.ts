import {
    createParser,
    readEnumValue,
    readObject,
    readOptionalBoolean,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import {
    workbenchCommandIds,
    type SetWorkbenchCommandKeybindingOverridesInput,
    type WorkbenchKeybindingGesture,
    type WorkbenchKeybindingOverrides,
} from '@/app/backend/runtime/contracts/types/workbench';

function parseWorkbenchKeybindingGesture(input: unknown, field: string): WorkbenchKeybindingGesture {
    const source = readObject(input, field);
    const key = readString(source.key, `${field}.key`).toLowerCase();

    if (key.length !== 1 && !['escape', 'enter', 'tab', 'space'].includes(key)) {
        throw new Error(`Invalid "${field}.key": expected a single key or supported named key.`);
    }

    const hasModifier =
        readOptionalBoolean(source.mod, `${field}.mod`) ||
        readOptionalBoolean(source.shift, `${field}.shift`) ||
        readOptionalBoolean(source.alt, `${field}.alt`);
    if (!hasModifier) {
        throw new Error(`Invalid "${field}": keybindings require at least one modifier.`);
    }

    return {
        key,
        ...(readOptionalBoolean(source.mod, `${field}.mod`) ? { mod: true } : {}),
        ...(readOptionalBoolean(source.shift, `${field}.shift`) ? { shift: true } : {}),
        ...(readOptionalBoolean(source.alt, `${field}.alt`) ? { alt: true } : {}),
    };
}

export function parseSetWorkbenchCommandKeybindingOverridesInput(
    input: unknown
): SetWorkbenchCommandKeybindingOverridesInput {
    const source = readObject(input, 'input');
    const overridesSource = readObject(source.overrides, 'overrides');
    const overrides: WorkbenchKeybindingOverrides = {};

    for (const [key, value] of Object.entries(overridesSource)) {
        const commandId = readEnumValue(key, `overrides.${key}`, workbenchCommandIds);
        if (value === null) {
            overrides[commandId] = null;
            continue;
        }

        overrides[commandId] = parseWorkbenchKeybindingGesture(value, `overrides.${key}`);
    }

    return { overrides };
}

export function parseWorkbenchKeybindingSettingsJson(input: unknown): WorkbenchKeybindingOverrides {
    const source = readObject(input, 'keybindingOverrides');
    const parsed = parseSetWorkbenchCommandKeybindingOverridesInput({ overrides: source });
    return parsed.overrides;
}

export const setWorkbenchCommandKeybindingOverridesInputSchema = createParser(
    parseSetWorkbenchCommandKeybindingOverridesInput
);
