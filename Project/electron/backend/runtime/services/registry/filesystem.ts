import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from 'yaml';

import { getPersistenceStoragePaths } from '@/app/backend/persistence/db';
import type {
    RegistryAssetTargetKind,
    RegistryDiscoveryDiagnostic,
    RegistryExactModeTarget,
    RegistryPaths,
    RegistryPresetKey,
    RegistryScope,
    RegistrySourceKind,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { registryPresetKeys } from '@/app/backend/runtime/contracts';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

interface ParsedFrontmatter {
    attributes: Record<string, unknown>;
    bodyMarkdown: string;
}

export interface RegistryAssetFile {
    absolutePath: string;
    relativePath: string;
    assetPath: string;
    relativeRootPath?: string;
    targetKind?: RegistryAssetTargetKind;
    presetKey?: RegistryPresetKey;
    targetMode?: RegistryExactModeTarget;
    parsed: ParsedFrontmatter;
}

interface NativeRegistryAssetMatch {
    assetPath: string;
    relativeRootPath: string;
    targetKind: RegistryAssetTargetKind;
    presetKey?: RegistryPresetKey;
    targetMode?: RegistryExactModeTarget;
}

interface NativeRegistryDiscoveryResult {
    files: RegistryAssetFile[];
    diagnostics: RegistryDiscoveryDiagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePathSeparators(value: string): string {
    return value.replace(/\\/g, '/');
}

function isTopLevelTab(value: string): value is TopLevelTab {
    return value === 'chat' || value === 'agent' || value === 'orchestrator';
}

function isModePathSegment(value: string): boolean {
    return /^[a-z0-9][a-z0-9_-]*$/u.test(value);
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

    const header = normalized.slice(4, closingIndex);
    const bodyMarkdown = normalized.slice(closingIndex + '\n---\n'.length).trim();
    let attributes: Record<string, unknown> = {};
    try {
        const document = parseDocument(header, {
            prettyErrors: false,
            strict: false,
            uniqueKeys: false,
        });
        const parsed = document.toJSON();
        attributes = isRecord(parsed) ? parsed : {};
    } catch {
        attributes = {};
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
            results.push(normalizePathSeparators(relativePath));
        }
    }

    return results.sort((left, right) => left.localeCompare(right));
}

async function ensureDirectory(pathToEnsure: string): Promise<void> {
    await mkdir(pathToEnsure, { recursive: true });
}

function createDiscoveryDiagnostic(input: {
    assetKind: 'rules' | 'skills';
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
    relativePath: string;
    code: RegistryDiscoveryDiagnostic['code'];
    message: string;
}): RegistryDiscoveryDiagnostic {
    const timestamp = new Date().toISOString();
    return {
        id: `regdiag_${randomUUID()}`,
        assetKind: input.assetKind,
        scope: input.scope,
        relativePath: normalizePathSeparators(input.relativePath),
        severity: 'error',
        code: input.code,
        message: input.message,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

function buildRulesMatch(relativePath: string): NativeRegistryAssetMatch | RegistryDiscoveryDiagnostic['code'] {
    const normalizedPath = normalizePathSeparators(relativePath);
    const segments = normalizedPath.split('/').filter((segment) => segment.length > 0);
    if (segments.length < 2) {
        return 'invalid_target_layout';
    }

    if (segments[0] === 'shared') {
        return {
            assetPath: segments.slice(1).join('/'),
            relativeRootPath: `rules/${normalizedPath}`,
            targetKind: 'shared',
        };
    }

    if (segments[0] === 'presets') {
        if (segments.length < 3) {
            return 'invalid_target_layout';
        }
        const presetKey = segments[1];
        if (!registryPresetKeys.includes(presetKey as RegistryPresetKey)) {
            return 'invalid_target_folder';
        }
        return {
            assetPath: segments.slice(2).join('/'),
            relativeRootPath: `rules/${normalizedPath}`,
            targetKind: 'preset',
            presetKey: presetKey as RegistryPresetKey,
        };
    }

    if (segments[0] === 'modes') {
        if (segments.length < 4) {
            return 'invalid_target_layout';
        }
        const topLevelTab = segments[1];
        const modeKey = segments[2];
        if (!topLevelTab || !modeKey) {
            return 'invalid_target_layout';
        }
        if (!isTopLevelTab(topLevelTab) || !isModePathSegment(modeKey)) {
            return 'invalid_target_mode';
        }
        return {
            assetPath: segments.slice(3).join('/'),
            relativeRootPath: `rules/${normalizedPath}`,
            targetKind: 'exact_mode',
            targetMode: {
                topLevelTab,
                modeKey,
            },
        };
    }

    return 'invalid_target_folder';
}

function buildSkillMatch(relativePath: string): NativeRegistryAssetMatch | RegistryDiscoveryDiagnostic['code'] | null {
    const normalizedPath = normalizePathSeparators(relativePath);
    const segments = normalizedPath.split('/').filter((segment) => segment.length > 0);
    if (segments.length < 2) {
        return 'invalid_target_layout';
    }

    const fileName = segments.at(-1);
    if (!fileName) {
        return 'invalid_target_layout';
    }
    const buildMatch = (input: {
        targetKind: RegistryAssetTargetKind;
        assetSegments: string[];
        presetKey?: RegistryPresetKey;
        targetMode?: RegistryExactModeTarget;
    }): NativeRegistryAssetMatch | RegistryDiscoveryDiagnostic['code'] | null => {
        if (fileName !== 'SKILL.md') {
            return input.assetSegments.length === 1 ? 'invalid_package_layout' : null;
        }
        if (input.assetSegments.length < 2) {
            return 'invalid_package_layout';
        }

        return {
            assetPath: input.assetSegments.slice(0, -1).join('/'),
            relativeRootPath: `skills/${normalizedPath}`,
            targetKind: input.targetKind,
            ...(input.presetKey ? { presetKey: input.presetKey } : {}),
            ...(input.targetMode ? { targetMode: input.targetMode } : {}),
        };
    };

    if (segments[0] === 'shared') {
        return buildMatch({
            targetKind: 'shared',
            assetSegments: segments.slice(1),
        });
    }

    if (segments[0] === 'presets') {
        if (segments.length < 3) {
            return 'invalid_target_layout';
        }
        const presetKey = segments[1];
        if (!registryPresetKeys.includes(presetKey as RegistryPresetKey)) {
            return 'invalid_target_folder';
        }
        return buildMatch({
            targetKind: 'preset',
            presetKey: presetKey as RegistryPresetKey,
            assetSegments: segments.slice(2),
        });
    }

    if (segments[0] === 'modes') {
        if (segments.length < 4) {
            return 'invalid_target_layout';
        }
        const topLevelTab = segments[1];
        const modeKey = segments[2];
        if (!topLevelTab || !modeKey) {
            return 'invalid_target_layout';
        }
        if (!isTopLevelTab(topLevelTab) || !isModePathSegment(modeKey)) {
            return 'invalid_target_mode';
        }
        return buildMatch({
            targetKind: 'exact_mode',
            targetMode: {
                topLevelTab,
                modeKey,
            },
            assetSegments: segments.slice(3),
        });
    }

    return 'invalid_target_folder';
}

async function collectModeAssetFiles(rootPath: string): Promise<RegistryAssetFile[]> {
    const modesRoot = path.join(rootPath, 'modes');
    await ensureDirectory(modesRoot);
    const relativePaths = await collectMarkdownFiles(modesRoot);
    const files = await Promise.all(
        relativePaths.map(async (relativePath) => {
            const absolutePath = path.join(modesRoot, relativePath);
            const content = await readFile(absolutePath, 'utf8');
            return {
                absolutePath,
                relativePath,
                assetPath: relativePath,
                parsed: parseFrontmatter(content),
            } satisfies RegistryAssetFile;
        })
    );

    return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function collectNativeRegistryAssetFiles(input: {
    rootPath: string;
    assetKind: 'rules' | 'skills';
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
}): Promise<NativeRegistryDiscoveryResult> {
    const assetRoot = path.join(input.rootPath, input.assetKind);
    await ensureDirectory(assetRoot);
    const relativePaths = await collectMarkdownFiles(assetRoot);
    const diagnostics: RegistryDiscoveryDiagnostic[] = [];
    const validPaths: NativeRegistryAssetMatch[] = [];

    for (const relativePath of relativePaths) {
        const matchResult =
            input.assetKind === 'rules' ? buildRulesMatch(relativePath) : buildSkillMatch(relativePath);
        if (!matchResult) {
            continue;
        }
        if (typeof matchResult === 'string') {
            diagnostics.push(
                createDiscoveryDiagnostic({
                    assetKind: input.assetKind,
                    scope: input.scope,
                    relativePath: `${input.assetKind}/${relativePath}`,
                    code: matchResult,
                    message:
                        matchResult === 'invalid_package_layout'
                            ? 'Skills in native roots must be package-shaped folders that contain a SKILL.md entrypoint.'
                            : matchResult === 'invalid_target_mode'
                              ? 'Exact-mode registry assets must live under a valid <topLevelTab>/<modeKey> folder path.'
                              : matchResult === 'invalid_target_folder'
                                ? 'Registry asset path must live under shared/, presets/<presetKey>/, or modes/<topLevelTab>/<modeKey>/.'
                                : 'Registry asset path is missing required target segments for its native folder family.',
                })
            );
            continue;
        }
        validPaths.push(matchResult);
    }

    const files = await Promise.all(
        validPaths.map(async (match) => {
            const absolutePath = path.join(input.rootPath, match.relativeRootPath);
            const content = await readFile(absolutePath, 'utf8');
            return {
                absolutePath,
                relativePath: normalizePathSeparators(path.relative(assetRoot, absolutePath)),
                assetPath: normalizePathSeparators(match.assetPath),
                relativeRootPath: match.relativeRootPath,
                targetKind: match.targetKind,
                ...(match.presetKey ? { presetKey: match.presetKey } : {}),
                ...(match.targetMode ? { targetMode: match.targetMode } : {}),
                parsed: parseFrontmatter(content),
            } satisfies RegistryAssetFile;
        })
    );

    return {
        files: files.sort((left, right) => left.relativeRootPath!.localeCompare(right.relativeRootPath!)),
        diagnostics: diagnostics.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    };
}

export async function resolveRegistryPaths(input: {
    profileId: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
}): Promise<RegistryPaths> {
    const { globalAssetsRoot } = getPersistenceStoragePaths();
    const nativeGlobalRoot = path.join(os.homedir(), '.neonconductor');

    if (!input.workspaceFingerprint) {
        return {
            modeRoots: {
                globalRoot: globalAssetsRoot,
            },
            nativeRulesSkillsRoots: {
                globalRoot: nativeGlobalRoot,
            },
        };
    }

    const workspaceRoot = await workspaceContextService.resolveExplicit({
        profileId: input.profileId,
        workspaceFingerprint: input.workspaceFingerprint,
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
    });
    const workspaceAssetsRoot =
        workspaceRoot.kind === 'workspace' || workspaceRoot.kind === 'sandbox'
            ? path.join(workspaceRoot.absolutePath, '.neonconductor')
            : undefined;

    return {
        modeRoots: {
            globalRoot: globalAssetsRoot,
            ...(workspaceAssetsRoot ? { workspaceRoot: workspaceAssetsRoot } : {}),
        },
        nativeRulesSkillsRoots: {
            globalRoot: nativeGlobalRoot,
            ...(workspaceAssetsRoot ? { workspaceRoot: workspaceAssetsRoot } : {}),
        },
    };
}

export async function loadRegistryModeAssetFiles(input: { rootPath: string }): Promise<RegistryAssetFile[]> {
    return collectModeAssetFiles(input.rootPath);
}

export async function loadNativeRegistryAssetFiles(input: {
    rootPath: string;
    assetKind: 'rules' | 'skills';
    scope: Extract<RegistryScope, 'global' | 'workspace'>;
}): Promise<NativeRegistryDiscoveryResult> {
    return collectNativeRegistryAssetFiles(input);
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
