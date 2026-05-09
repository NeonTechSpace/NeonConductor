import { getPersistence } from '@/app/backend/persistence/db';
import { parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import { parseWorkbenchKeybindingSettingsJson } from '@/app/backend/runtime/contracts/parsers/workbench';
import {
    workbenchCommandDefinitions,
    type WorkbenchCommandId,
    type WorkbenchCommandKeybindingView,
    type WorkbenchCommandSettings,
    type WorkbenchKeybindingGesture,
    type WorkbenchKeybindingOverrides,
} from '@/app/backend/runtime/contracts/types/workbench';

const APP_WORKBENCH_COMMAND_SETTINGS_ID = 'global';

function gestureResource(gesture: WorkbenchKeybindingGesture): string {
    return [
        gesture.mod ? 'mod' : undefined,
        gesture.shift ? 'shift' : undefined,
        gesture.alt ? 'alt' : undefined,
        gesture.key.toLowerCase(),
    ]
        .filter((part): part is string => Boolean(part))
        .join('+');
}

function normalizeGesture(gesture: WorkbenchKeybindingGesture): WorkbenchKeybindingGesture {
    return {
        key: gesture.key.toLowerCase(),
        ...(gesture.mod ? { mod: true } : {}),
        ...(gesture.shift ? { shift: true } : {}),
        ...(gesture.alt ? { alt: true } : {}),
    };
}

function normalizeOverrides(overrides: WorkbenchKeybindingOverrides): WorkbenchKeybindingOverrides {
    const normalized: WorkbenchKeybindingOverrides = {};
    for (const definition of workbenchCommandDefinitions) {
        if (!(definition.id in overrides)) {
            continue;
        }

        const value = overrides[definition.id];
        normalized[definition.id] = value === null || value === undefined ? null : normalizeGesture(value);
    }
    return normalized;
}

function getDefaultKeybinding(
    definition: (typeof workbenchCommandDefinitions)[number]
): WorkbenchKeybindingGesture | undefined {
    return 'defaultKeybinding' in definition ? definition.defaultKeybinding : undefined;
}

function buildKeybindings(overrides: WorkbenchKeybindingOverrides): WorkbenchCommandKeybindingView[] {
    return workbenchCommandDefinitions.map((definition) => {
        const overrideKeybinding = overrides[definition.id];
        const defaultKeybinding = getDefaultKeybinding(definition);
        const effectiveKeybinding = overrideKeybinding === null ? undefined : (overrideKeybinding ?? defaultKeybinding);

        return {
            commandId: definition.id,
            ...(defaultKeybinding ? { defaultKeybinding } : {}),
            ...(definition.id in overrides ? { overrideKeybinding } : {}),
            ...(effectiveKeybinding ? { effectiveKeybinding } : {}),
        };
    });
}

function assertNoConflicts(overrides: WorkbenchKeybindingOverrides): void {
    const seen = new Map<string, WorkbenchCommandId>();
    for (const keybinding of buildKeybindings(overrides)) {
        if (!keybinding.effectiveKeybinding) {
            continue;
        }

        const resource = gestureResource(keybinding.effectiveKeybinding);
        const existingCommandId = seen.get(resource);
        if (existingCommandId) {
            throw new Error(
                `Keybinding conflict: "${resource}" is already assigned to "${existingCommandId}" and "${keybinding.commandId}".`
            );
        }

        seen.set(resource, keybinding.commandId);
    }
}

function mapWorkbenchCommandSettings(row: {
    keybinding_overrides_json: string;
    updated_at: string;
}): WorkbenchCommandSettings {
    const parsedOverrides = parseWorkbenchKeybindingSettingsJson(parseJsonRecord(row.keybinding_overrides_json));
    const overrides = normalizeOverrides(parsedOverrides);
    assertNoConflicts(overrides);

    return {
        keybindings: buildKeybindings(overrides),
        updatedAt: row.updated_at,
    };
}

export class AppWorkbenchCommandSettingsStore {
    async get(): Promise<WorkbenchCommandSettings> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('app_workbench_command_settings')
            .select(['keybinding_overrides_json', 'updated_at'])
            .where('id', '=', APP_WORKBENCH_COMMAND_SETTINGS_ID)
            .executeTakeFirst();

        if (row) {
            return mapWorkbenchCommandSettings(row);
        }

        return this.set({});
    }

    async set(overrides: WorkbenchKeybindingOverrides): Promise<WorkbenchCommandSettings> {
        const { db } = getPersistence();
        const normalizedOverrides = normalizeOverrides(overrides);
        assertNoConflicts(normalizedOverrides);
        const updatedAt = nowIso();

        await db
            .insertInto('app_workbench_command_settings')
            .values({
                id: APP_WORKBENCH_COMMAND_SETTINGS_ID,
                keybinding_overrides_json: JSON.stringify(normalizedOverrides),
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.column('id').doUpdateSet({
                    keybinding_overrides_json: JSON.stringify(normalizedOverrides),
                    updated_at: updatedAt,
                })
            )
            .execute();

        return {
            keybindings: buildKeybindings(normalizedOverrides),
            updatedAt,
        };
    }

    async reset(): Promise<WorkbenchCommandSettings> {
        return this.set({});
    }
}

export const appWorkbenchCommandSettingsStore = new AppWorkbenchCommandSettingsStore();
