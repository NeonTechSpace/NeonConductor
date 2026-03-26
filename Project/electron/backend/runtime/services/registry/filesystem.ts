import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { getPersistenceStoragePaths } from '@/app/backend/persistence/db';
import type { RegistryPresetKey, RegistryScope, RegistrySourceKind } from '@/app/backend/runtime/contracts';
import type { RegistryPaths } from '@/app/backend/runtime/services/registry/types';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

interface ParsedFrontmatter {
    attributes: Record<string, unknown>;
    bodyMarkdown: string;
}

export interface RegistryAssetFile {
    absolutePath: string;
    relativePath: string;
    assetPath: string;
    presetKey?: RegistryPresetKey;
    parsed: ParsedFrontmatter;
}

function stripQuotes(value: string): string {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function parseScalar(value: string): unknown {
    const rawValue = value.trim();
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        try {
            return JSON.parse(rawValue);
        } catch {
            return stripQuotes(rawValue);
        }
    }

    const trimmed = stripQuotes(rawValue);
    if (trimmed === 'true') {
        return true;
    }
    if (trimmed === 'false') {
        return false;
    }
    if (/^-?\d+$/.test(trimmed)) {
        return Number.parseInt(trimmed, 10);
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return trimmed
            .slice(1, -1)
            .split(',')
            .map((item) => stripQuotes(item))
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
    }

    return trimmed;
}

function parseFrontmatter(markdown: string): ParsedFrontmatter {
    const normalized = markdown.replace(/\r\n?/g, '\n');
    if (!normalized.startsWith('---\n')) {
        return {
            attributes: {},
            bodyMarkdown: normalized.trim(),
        };
    }

    const closingIndex = normalized.indexOf('\n---\n', 4);
    if (closingIndex < 0) {
        return {
            attributes: {},
            bodyMarkdown: normalized.trim(),
        };
    }

    const header = normalized.slice(4, closingIndex).split('\n');
    const bodyMarkdown = normalized.slice(closingIndex + '\n---\n'.length).trim();
    const attributes: Record<string, unknown> = {};

    for (let index = 0; index < header.length; index += 1) {
        const line = header[index]?.trimEnd() ?? '';
        if (line.trim().length === 0) {
            continue;
        }

        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (!match) {
            continue;
        }

        const key = match[1];
        const rawValue = match[2] ?? '';
        if (!key) {
            continue;
        }

        if (rawValue.trim().length > 0) {
            attributes[key] = parseScalar(rawValue);
            continue;
        }

        const items: string[] = [];
        let nextIndex = index + 1;
        while (nextIndex < header.length) {
            const nextLine = header[nextIndex] ?? '';
            const arrayMatch = nextLine.match(/^\s*-\s+(.+)$/);
            if (!arrayMatch) {
                break;
            }
            const item = arrayMatch[1];
            if (item) {
                items.push(stripQuotes(item));
            }
            nextIndex += 1;
        }

        if (items.length > 0) {
            attributes[key] = items;
            index = nextIndex - 1;
            continue;
        }

        attributes[key] = '';
    }

    return {
        attributes,
        bodyMarkdown,
    };
}

async function collectMarkdownFiles(rootPath: string, relativePrefix = ''): Promise<string[]> {
    const dirents = await readdir(rootPath, { withFileTypes: true });
    const results: string[] = [];

    for (const dirent of dirents) {
        const absolutePath = path.join(rootPath, dirent.name);
        const relativePath = relativePrefix.length > 0 ? path.join(relativePrefix, dirent.name) : dirent.name;
        if (dirent.isDirectory()) {
            results.push(...(await collectMarkdownFiles(absolutePath, relativePath)));
            continue;
        }

        if (dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.md') {
            results.push(relativePath);
        }
    }

    return results;
}

async function collectNamedMarkdownFiles(rootPath: string, fileName: string, relativePrefix = ''): Promise<string[]> {
    const dirents = await readdir(rootPath, { withFileTypes: true });
    const results: string[] = [];

    for (const dirent of dirents) {
        const absolutePath = path.join(rootPath, dirent.name);
        const relativePath = relativePrefix.length > 0 ? path.join(relativePrefix, dirent.name) : dirent.name;
        if (dirent.isDirectory()) {
            results.push(...(await collectNamedMarkdownFiles(absolutePath, fileName, relativePath)));
            continue;
        }

        if (dirent.isFile() && dirent.name === fileName) {
            results.push(relativePath);
        }
    }

    return results;
}

function toSkillAssetPath(relativePath: string): string {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    if (normalizedPath.toUpperCase() === 'SKILL.MD') {
        return normalizedPath;
    }

    if (normalizedPath.toUpperCase().endsWith('/SKILL.MD')) {
        return normalizedPath.slice(0, -'/SKILL.md'.length);
    }

    return normalizedPath;
}

async function collectSkillEntryFiles(rootPath: string): Promise<Array<{ relativePath: string; assetPath: string }>> {
    const [topLevelEntries, nestedSkillEntries] = await Promise.all([
        readdir(rootPath, { withFileTypes: true }),
        collectNamedMarkdownFiles(rootPath, 'SKILL.md'),
    ]);
    const relativePathToAssetPath = new Map<string, string>();

    for (const dirent of topLevelEntries) {
        if (!dirent.isFile() || path.extname(dirent.name).toLowerCase() !== '.md') {
            continue;
        }

        relativePathToAssetPath.set(dirent.name, dirent.name.replace(/\\/g, '/'));
    }

    for (const relativePath of nestedSkillEntries) {
        relativePathToAssetPath.set(relativePath, toSkillAssetPath(relativePath));
    }

    return Array.from(relativePathToAssetPath.entries())
        .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
        .map(([relativePath, assetPath]) => ({
            relativePath,
            assetPath,
        }));
}

async function ensureDirectory(pathToEnsure: string): Promise<void> {
    await mkdir(pathToEnsure, { recursive: true });
}

export async function resolveRegistryPaths(input: {
    profileId: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
}): Promise<RegistryPaths> {
    const { globalAssetsRoot } = getPersistenceStoragePaths();

    if (!input.workspaceFingerprint) {
        return {
            globalAssetsRoot,
        };
    }

    const workspaceRoot = await workspaceContextService.resolveExplicit({
        profileId: input.profileId,
        workspaceFingerprint: input.workspaceFingerprint,
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
    });
    return {
        globalAssetsRoot,
        ...(workspaceRoot.kind === 'workspace' || workspaceRoot.kind === 'sandbox'
            ? {
                  workspaceAssetsRoot: path.join(workspaceRoot.absolutePath, '.neonconductor'),
              }
            : {}),
    };
}

export async function loadRegistryAssetFiles(input: {
    rootPath: string;
    relativeDirectory: string;
    assetKind: 'modes' | 'rules' | 'skills';
    presetKey?: RegistryPresetKey;
}): Promise<RegistryAssetFile[]> {
    const scopedRoot = path.join(input.rootPath, input.relativeDirectory);
    await ensureDirectory(scopedRoot);
    const entries =
        input.assetKind === 'skills'
            ? await collectSkillEntryFiles(scopedRoot)
            : (await collectMarkdownFiles(scopedRoot)).map((relativePath) => ({
                  relativePath,
                  assetPath: relativePath.replace(/\\/g, '/'),
              }));
    const files = await Promise.all(
        entries.map(async ({ relativePath, assetPath }) => {
            const absolutePath = path.join(scopedRoot, relativePath);
            const content = await readFile(absolutePath, 'utf8');
            return {
                absolutePath,
                relativePath: relativePath.replace(/\\/g, '/'),
                assetPath: assetPath.replace(/\\/g, '/'),
                ...(input.presetKey ? { presetKey: input.presetKey } : {}),
                parsed: parseFrontmatter(content),
            };
        })
    );

    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export async function readRegistryMarkdownBody(absolutePath: string): Promise<string> {
    const content = await readFile(absolutePath, 'utf8');
    return parseFrontmatter(content).bodyMarkdown;
}

export function slugifyAssetKey(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\\/g, '/')
        .replace(/\.md$/i, '')
        .replace(/[^a-z0-9/_-]+/g, '_')
        .replace(/\/+/g, '/')
        .replace(/^_+|_+$/g, '');
}

export function titleCaseFromKey(value: string): string {
    const key = value.replace(/\\/g, '/').split('/').at(-1)?.replace(/[_-]+/g, ' ').trim();
    if (!key || key.length === 0) {
        return 'Untitled';
    }

    return key
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function toSourceKind(
    scope: Extract<RegistryScope, 'global' | 'workspace'>
): Extract<RegistrySourceKind, 'global_file' | 'workspace_file'> {
    return scope === 'global' ? 'global_file' : 'workspace_file';
}
