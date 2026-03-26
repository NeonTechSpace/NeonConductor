import { access, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ModeDefinitionRecord } from '@/app/backend/persistence/types';
import {
    toolCapabilities as knownToolCapabilities,
    type ToolCapability,
    type TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { slugifyAssetKey, resolveRegistryPaths } from '@/app/backend/runtime/services/registry/filesystem';


export interface CanonicalCustomModePayload {
    slug: string;
    name: string;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    tags?: string[];
    toolCapabilities?: ToolCapability[];
}

export interface PortableCustomModePayload {
    slug: string;
    name: string;
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    groups?: string[];
}

const portableModeAllowedKeys = new Set([
    'slug',
    'name',
    'description',
    'roleDefinition',
    'customInstructions',
    'whenToUse',
    'groups',
]);

const portableModeUnsupportedKeys = new Set(['topLevelTab']);

const portableGroupCapabilityMap = {
    read: ['filesystem_read'],
    edit: ['filesystem_read', 'filesystem_write'],
    command: ['shell'],
} as const satisfies Record<string, ToolCapability[]>;

const unsupportedPortableGroups = new Set(['browser', 'mcp', 'ask', 'modes']);

function readOptionalPortableString(
    value: unknown,
    field: keyof PortableCustomModePayload | keyof CanonicalCustomModePayload
): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error(`Invalid "${field}": expected string.`);
    }

    return value.trim().length > 0 ? value.replace(/\r\n?/g, '\n').trim() : undefined;
}

function readOptionalPortableStringArray(value: unknown, field: 'groups' | 'tags'): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new Error(`Invalid "${field}": expected string array.`);
    }

    const items = value.map((item, index) => {
        if (Array.isArray(item)) {
            throw new Error(
                `Unsupported "${field}[${String(index)}]": restricted tuple forms are not supported in this slice.`
            );
        }
        if (typeof item !== 'string') {
            throw new Error(`Invalid "${field}": expected string array.`);
        }

        return item.trim();
    });
    const filteredItems = items.filter((item) => item.length > 0);
    return filteredItems.length > 0 ? Array.from(new Set(filteredItems)) : undefined;
}

function readOptionalToolCapabilities(value: unknown, field: 'toolCapabilities'): ToolCapability[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new Error(`Invalid "${field}": expected string array.`);
    }

    const capabilities = value.map((item) => {
        if (typeof item !== 'string' || !knownToolCapabilities.includes(item as ToolCapability)) {
            throw new Error(`Invalid "${field}": expected only ${knownToolCapabilities.join(', ')}.`);
        }

        return item as ToolCapability;
    });
    return capabilities.length > 0 ? Array.from(new Set(capabilities)) : undefined;
}

function normalizeCanonicalCustomModePayload(input: CanonicalCustomModePayload): CanonicalCustomModePayload {
    const slug = readOptionalPortableString(input.slug, 'slug');
    if (!slug) {
        throw new Error('Invalid "slug": expected non-empty string.');
    }
    const name = readOptionalPortableString(input.name, 'name');
    if (!name) {
        throw new Error('Invalid "name": expected non-empty string.');
    }

    const description = readOptionalPortableString(input.description, 'description');
    const roleDefinition = readOptionalPortableString(input.roleDefinition, 'roleDefinition');
    const customInstructions = readOptionalPortableString(input.customInstructions, 'customInstructions');
    const whenToUse = readOptionalPortableString(input.whenToUse, 'whenToUse');
    const tags = readOptionalPortableStringArray(input.tags, 'tags');
    const toolCapabilities = readOptionalToolCapabilities(input.toolCapabilities, 'toolCapabilities');

    return {
        slug,
        name,
        ...(description ? { description } : {}),
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
        ...(whenToUse ? { whenToUse } : {}),
        ...(tags ? { tags } : {}),
        ...(toolCapabilities ? { toolCapabilities } : {}),
    };
}

function normalizePortableCustomModePayload(input: PortableCustomModePayload): PortableCustomModePayload {
    const slug = readOptionalPortableString(input.slug, 'slug');
    if (!slug) {
        throw new Error('Invalid "slug": expected non-empty string.');
    }
    const name = readOptionalPortableString(input.name, 'name');
    if (!name) {
        throw new Error('Invalid "name": expected non-empty string.');
    }

    const description = readOptionalPortableString(input.description, 'description');
    const roleDefinition = readOptionalPortableString(input.roleDefinition, 'roleDefinition');
    const customInstructions = readOptionalPortableString(input.customInstructions, 'customInstructions');
    const whenToUse = readOptionalPortableString(input.whenToUse, 'whenToUse');
    const groups = readOptionalPortableStringArray(input.groups, 'groups');

    return {
        slug,
        name,
        ...(description ? { description } : {}),
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
        ...(whenToUse ? { whenToUse } : {}),
        ...(groups ? { groups } : {}),
    };
}

function convertPortableGroupsToToolCapabilities(groups: string[] | undefined): ToolCapability[] | undefined {
    if (!groups || groups.length === 0) {
        return undefined;
    }

    const capabilities = new Set<ToolCapability>();
    for (const group of groups) {
        if (unsupportedPortableGroups.has(group)) {
            throw new Error(`Unsupported portable tool group "${group}".`);
        }
        if (!(group in portableGroupCapabilityMap)) {
            throw new Error(`Unsupported portable tool group "${group}".`);
        }
        const mappedCapabilities = portableGroupCapabilityMap[group as keyof typeof portableGroupCapabilityMap];

        mappedCapabilities.forEach((capability) => capabilities.add(capability));
    }

    return capabilities.size > 0 ? Array.from(capabilities) : undefined;
}

function convertToolCapabilitiesToPortableGroups(toolCapabilities: ToolCapability[] | undefined): string[] | undefined {
    if (!toolCapabilities || toolCapabilities.length === 0) {
        return undefined;
    }

    const capabilitySet = new Set(toolCapabilities);
    if (capabilitySet.has('git')) {
        throw new Error('Portable export does not support the "git" tool capability in this slice.');
    }
    if (capabilitySet.has('filesystem_write') && !capabilitySet.has('filesystem_read')) {
        throw new Error('Portable export cannot represent "filesystem_write" without "filesystem_read".');
    }

    const groups: string[] = [];
    if (capabilitySet.has('filesystem_write')) {
        groups.push('edit');
        capabilitySet.delete('filesystem_write');
        capabilitySet.delete('filesystem_read');
    } else if (capabilitySet.has('filesystem_read')) {
        groups.push('read');
        capabilitySet.delete('filesystem_read');
    }
    if (capabilitySet.has('shell')) {
        groups.push('command');
        capabilitySet.delete('shell');
    }
    if (capabilitySet.size > 0) {
        throw new Error(`Portable export cannot represent tool capabilities: ${Array.from(capabilitySet).join(', ')}.`);
    }

    return groups.length > 0 ? groups : undefined;
}

export function parsePortableCustomModeJson(jsonText: string): PortableCustomModePayload {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (error) {
        throw new Error(`Invalid custom mode JSON: ${(error as Error).message}`, {
            cause: error,
        });
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid custom mode JSON: expected object.');
    }

    const source = parsed as Record<string, unknown>;
    for (const key of Object.keys(source)) {
        if (portableModeUnsupportedKeys.has(key)) {
            throw new Error(`Unsupported custom mode field "${key}" is not supported in this slice.`);
        }
        if (!portableModeAllowedKeys.has(key)) {
            throw new Error(`Invalid custom mode field "${key}".`);
        }
    }

    return normalizePortableCustomModePayload({
        slug: source.slug as string,
        name: source.name as string,
        ...(typeof source.description === 'string' ? { description: source.description } : {}),
        ...(typeof source.roleDefinition === 'string' ? { roleDefinition: source.roleDefinition } : {}),
        ...(typeof source.customInstructions === 'string' ? { customInstructions: source.customInstructions } : {}),
        ...(typeof source.whenToUse === 'string' ? { whenToUse: source.whenToUse } : {}),
        ...(source.groups !== undefined ? { groups: source.groups as string[] } : {}),
    });
}

export function toCanonicalCustomModePayload(input: PortableCustomModePayload): CanonicalCustomModePayload {
    const payload = normalizePortableCustomModePayload(input);
    const toolCapabilities = convertPortableGroupsToToolCapabilities(payload.groups);

    return normalizeCanonicalCustomModePayload({
        slug: payload.slug,
        name: payload.name,
        ...(payload.description ? { description: payload.description } : {}),
        ...(payload.roleDefinition ? { roleDefinition: payload.roleDefinition } : {}),
        ...(payload.customInstructions ? { customInstructions: payload.customInstructions } : {}),
        ...(payload.whenToUse ? { whenToUse: payload.whenToUse } : {}),
        ...(toolCapabilities ? { toolCapabilities } : {}),
    });
}

export function toPortableModePayload(mode: ModeDefinitionRecord): PortableCustomModePayload {
    const groups = convertToolCapabilitiesToPortableGroups(mode.executionPolicy.toolCapabilities);

    return normalizePortableCustomModePayload({
        slug: mode.modeKey,
        name: mode.label,
        ...(mode.description ? { description: mode.description } : {}),
        ...(mode.prompt.roleDefinition ? { roleDefinition: mode.prompt.roleDefinition } : {}),
        ...(mode.prompt.customInstructions ? { customInstructions: mode.prompt.customInstructions } : {}),
        ...(mode.whenToUse ? { whenToUse: mode.whenToUse } : {}),
        ...(groups ? { groups } : {}),
    });
}

export function buildCanonicalCustomModePayload(input: CanonicalCustomModePayload): CanonicalCustomModePayload {
    return normalizeCanonicalCustomModePayload(input);
}

function stringifyFrontmatterValue(value: string): string {
    return JSON.stringify(value.replace(/\r\n?/g, '\n'));
}

export function renderCanonicalModeMarkdown(input: { topLevelTab: TopLevelTab; payload: CanonicalCustomModePayload }): {
    modeKey: string;
    fileContent: string;
} {
    const payload = normalizeCanonicalCustomModePayload(input.payload);
    const modeKey = slugifyAssetKey(payload.slug).replace(/\//g, '_');
    if (modeKey.length === 0) {
        throw new Error('Invalid "slug": could not derive a file-backed mode key.');
    }

    const lines = [
        '---',
        `topLevelTab: ${input.topLevelTab}`,
        `modeKey: ${modeKey}`,
        `label: ${stringifyFrontmatterValue(payload.name)}`,
        ...(payload.description ? [`description: ${stringifyFrontmatterValue(payload.description)}`] : []),
        ...(payload.whenToUse ? [`whenToUse: ${stringifyFrontmatterValue(payload.whenToUse)}`] : []),
        ...(payload.tags ? ['tags:', ...payload.tags.map((tag) => `  - ${stringifyFrontmatterValue(tag)}`)] : []),
        ...(payload.toolCapabilities
            ? ['toolCapabilities:', ...payload.toolCapabilities.map((capability) => `  - ${capability}`)]
            : []),
        ...(payload.roleDefinition ? [`roleDefinition: ${stringifyFrontmatterValue(payload.roleDefinition)}`] : []),
        '---',
    ];
    const body = payload.customInstructions?.replace(/\r\n?/g, '\n').trim() ?? '';

    return {
        modeKey,
        fileContent: body.length > 0 ? `${lines.join('\n')}\n${body}\n` : `${lines.join('\n')}\n`,
    };
}

export async function resolveCustomModeDirectory(input: {
    profileId: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
}): Promise<string> {
    const paths = await resolveRegistryPaths({
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });

    if (input.scope === 'workspace') {
        if (!paths.workspaceAssetsRoot || !input.workspaceFingerprint) {
            throw new Error('Workspace mode import requires a selected workspace.');
        }

        const directory = path.join(paths.workspaceAssetsRoot, 'modes');
        await mkdir(directory, { recursive: true });
        return directory;
    }

    const directory = path.join(paths.globalAssetsRoot, 'modes');
    await mkdir(directory, { recursive: true });
    return directory;
}

export async function writePortableModeFile(input: { absolutePath: string; fileContent: string }): Promise<void> {
    const directory = path.dirname(input.absolutePath);
    await mkdir(directory, { recursive: true });
    const tempPath = `${input.absolutePath}.tmp`;
    await writeFile(tempPath, input.fileContent, 'utf8');
    await rename(tempPath, input.absolutePath);
}

export async function deletePortableModeFile(absolutePath: string): Promise<void> {
    await unlink(absolutePath);
}

export async function fileExists(absolutePath: string): Promise<boolean> {
    try {
        await access(absolutePath);
        return true;
    } catch {
        return false;
    }
}
