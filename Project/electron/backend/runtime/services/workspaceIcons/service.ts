import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getPersistenceStoragePaths } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import {
    workspaceRootStore,
    type WorkspaceRootAssetMetadata,
    type WorkspaceRootIconMetadataPatch,
} from '@/app/backend/persistence/stores/workspace/workspaceRootStore';
import type {
    RuntimePatchWorkspaceRootInput,
    RuntimePatchWorkspaceRootResult,
    RuntimeRegisterWorkspaceRootInput,
    RuntimeRegisterWorkspaceRootResult,
    WorkspaceIconSourceKind,
} from '@/app/backend/runtime/contracts';
import {
    errOp,
    okOp,
    toOperationalError,
    type OperationalResult,
} from '@/app/backend/runtime/services/common/operationalError';

const MAX_ICON_BYTES = 1024 * 1024;
const MAX_SOURCE_BYTES = 128 * 1024;
const MANUAL_ICON_EXTENSIONS = new Set(['.png', '.ico', '.svg']);
const DETECTED_ICON_EXTENSIONS = MANUAL_ICON_EXTENSIONS;

const WELL_KNOWN_ICON_CANDIDATES = [
    'favicon.svg',
    'favicon.ico',
    'favicon.png',
    'icon.svg',
    'icon.ico',
    'icon.png',
    'public/favicon.svg',
    'public/favicon.ico',
    'public/favicon.png',
    'public/icon.svg',
    'public/icon.ico',
    'public/icon.png',
    'app/favicon.ico',
    'app/favicon.png',
    'app/icon.svg',
    'app/icon.png',
    'app/icon.ico',
    'src/favicon.ico',
    'src/favicon.svg',
    'src/app/favicon.ico',
    'src/app/icon.svg',
    'src/app/icon.png',
    'assets/icon.svg',
    'assets/icon.png',
    'assets/icon.ico',
    'assets/logo.svg',
    'assets/logo.png',
    'assets/logo.ico',
] as const;

const SOURCE_INSPECTION_FILES = [
    'index.html',
    'public/index.html',
    'app/layout.tsx',
    'app/layout.jsx',
    'app/layout.ts',
    'src/app/layout.tsx',
    'src/app/layout.jsx',
    'src/app/layout.ts',
    'src/pages/_document.tsx',
    'src/pages/_app.tsx',
] as const;

const MANIFEST_FILES = [
    'manifest.json',
    'site.webmanifest',
    'public/manifest.json',
    'public/site.webmanifest',
] as const;

export interface WorkspaceIconPayload {
    bytes: Uint8Array;
    mimeType: string;
}

interface DetectedIcon {
    sourceKind: WorkspaceIconSourceKind;
    relativePath: string;
}

function normalizeRelativePath(relativePath: string): string {
    return relativePath.replaceAll('\\', '/');
}

function sha256Hex(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function mimeTypeForExtension(extension: string): string | null {
    if (extension === '.png') {
        return 'image/png';
    }
    if (extension === '.ico') {
        return 'image/x-icon';
    }
    if (extension === '.svg') {
        return 'image/svg+xml';
    }
    return null;
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
    const relativePath = path.relative(rootPath, candidatePath);
    return relativePath.length === 0 || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function isRemoteOrDataUrl(value: string): boolean {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith('//') || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) {
        return true;
    }
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
        return false;
    }
    const firstPathDelimiter = Math.min(
        ...['/', '?', '#'].map((delimiter) => {
            const index = trimmed.indexOf(delimiter);
            return index === -1 ? Number.POSITIVE_INFINITY : index;
        })
    );
    return colonIndex < firstPathDelimiter;
}

function normalizeDeclaredLocalPath(value: string): string | null {
    const withoutQuery = value.trim().split(/[?#]/, 1)[0]?.trim() ?? '';
    if (!withoutQuery || isRemoteOrDataUrl(withoutQuery)) {
        return null;
    }
    const trimmed = withoutQuery.startsWith('/') ? withoutQuery.slice(1) : withoutQuery;
    const normalized = normalizeRelativePath(path.posix.normalize(trimmed.replaceAll('\\', '/')));
    if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
        return null;
    }
    return normalized;
}

function isSvgSafe(text: string): boolean {
    return (
        !/<script\b/i.test(text) &&
        !/<foreignObject\b/i.test(text) &&
        !/\son[a-z]+\s*=/i.test(text) &&
        !/javascript:/i.test(text) &&
        !/\b(?:href|src)\s*=\s*["']https?:\/\//i.test(text)
    );
}

async function readBoundedTextFile(absolutePath: string): Promise<string | null> {
    try {
        const info = await stat(absolutePath);
        if (!info.isFile() || info.size > MAX_SOURCE_BYTES) {
            return null;
        }
        return await readFile(absolutePath, 'utf8');
    } catch {
        return null;
    }
}

async function validateWorkspaceIconCandidate(input: {
    workspaceRootPath: string;
    relativePath: string;
}): Promise<string | null> {
    const normalizedRelativePath = normalizeDeclaredLocalPath(input.relativePath);
    if (!normalizedRelativePath) {
        return null;
    }
    const extension = path.extname(normalizedRelativePath).toLowerCase();
    if (!DETECTED_ICON_EXTENSIONS.has(extension)) {
        return null;
    }

    try {
        const rootRealPath = await realpath(input.workspaceRootPath);
        const absolutePath = path.resolve(rootRealPath, normalizedRelativePath);
        const candidateRealPath = await realpath(absolutePath);
        if (!isWithinRoot(candidateRealPath, rootRealPath)) {
            return null;
        }
        const info = await stat(candidateRealPath);
        if (!info.isFile() || info.size <= 0 || info.size > MAX_ICON_BYTES) {
            return null;
        }
        if (extension === '.svg') {
            const text = await readFile(candidateRealPath, 'utf8');
            if (!isSvgSafe(text)) {
                return null;
            }
        }
        return normalizeRelativePath(path.relative(rootRealPath, candidateRealPath));
    } catch {
        return null;
    }
}

async function detectWellKnownIcon(workspaceRootPath: string): Promise<DetectedIcon | null> {
    for (const relativePath of WELL_KNOWN_ICON_CANDIDATES) {
        const detectedRelativePath = await validateWorkspaceIconCandidate({
            workspaceRootPath,
            relativePath,
        });
        if (detectedRelativePath) {
            return {
                sourceKind: 'well_known_file',
                relativePath: detectedRelativePath,
            };
        }
    }
    return null;
}

function extractHtmlIconReferences(text: string): string[] {
    const references: string[] = [];
    const linkRegex = /<link\b[^>]*>/gi;
    for (const match of text.matchAll(linkRegex)) {
        const tag = match[0];
        const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? '';
        if (!rel.split(/\s+/).some((part) => part === 'icon' || part === 'shortcut')) {
            continue;
        }
        const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
        if (href) {
            references.push(href);
        }
    }

    const metadataRegex = /(?:icon|favicon|appleIcon)\s*[:=]\s*["'`]([^"'`]+)["'`]/gi;
    for (const match of text.matchAll(metadataRegex)) {
        const value = match[1];
        if (value) {
            references.push(value);
        }
    }
    return references;
}

async function detectHtmlIcon(workspaceRootPath: string): Promise<DetectedIcon | null> {
    for (const sourceFile of SOURCE_INSPECTION_FILES) {
        const text = await readBoundedTextFile(path.join(workspaceRootPath, sourceFile));
        if (!text) {
            continue;
        }
        for (const reference of extractHtmlIconReferences(text)) {
            const detectedRelativePath = await validateWorkspaceIconCandidate({
                workspaceRootPath,
                relativePath: reference,
            });
            if (detectedRelativePath) {
                return {
                    sourceKind: 'html_link',
                    relativePath: detectedRelativePath,
                };
            }
        }
    }
    return null;
}

function extractManifestIconReferences(text: string): string[] {
    try {
        const manifest = JSON.parse(text) as { icons?: Array<{ src?: unknown; sizes?: unknown }> };
        return (manifest.icons ?? [])
            .map((icon) => (typeof icon.src === 'string' ? icon.src : undefined))
            .filter((value): value is string => Boolean(value));
    } catch {
        return [];
    }
}

async function detectManifestIcon(workspaceRootPath: string): Promise<DetectedIcon | null> {
    for (const manifestFile of MANIFEST_FILES) {
        const text = await readBoundedTextFile(path.join(workspaceRootPath, manifestFile));
        if (!text) {
            continue;
        }
        for (const reference of extractManifestIconReferences(text)) {
            const detectedRelativePath = await validateWorkspaceIconCandidate({
                workspaceRootPath,
                relativePath: reference,
            });
            if (detectedRelativePath) {
                return {
                    sourceKind: 'manifest_icon',
                    relativePath: detectedRelativePath,
                };
            }
        }
    }
    return null;
}

async function detectWorkspaceIcon(workspaceRootPath: string): Promise<DetectedIcon | null> {
    return (
        (await detectWellKnownIcon(workspaceRootPath)) ??
        (await detectHtmlIcon(workspaceRootPath)) ??
        (await detectManifestIcon(workspaceRootPath))
    );
}

function fallbackIconPayload(): WorkspaceIconPayload {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#18181b"/><path d="M10 23a7 7 0 0 1 7-7h9.4a6 6 0 0 1 4.8 2.4l2.1 2.8H47a7 7 0 0 1 7 7v13a7 7 0 0 1-7 7H17a7 7 0 0 1-7-7V23Z" fill="#f4f4f5"/><path d="M10 27h44v14a7 7 0 0 1-7 7H17a7 7 0 0 1-7-7V27Z" fill="#a1a1aa"/></svg>`;
    return {
        bytes: Uint8Array.from(Buffer.from(svg, 'utf8')),
        mimeType: 'image/svg+xml',
    };
}

function resolveGlobalAssetPath(relativePath: string): string {
    const { globalAssetsRoot } = getPersistenceStoragePaths();
    const absolutePath = path.resolve(globalAssetsRoot, relativePath);
    if (!isWithinRoot(absolutePath, path.resolve(globalAssetsRoot))) {
        throw new Error('Workspace icon asset path escaped the global asset root.');
    }
    return absolutePath;
}

async function copyManualIcon(input: {
    profileId: string;
    workspaceFingerprint: string;
    sourceAbsolutePath: string;
}): Promise<WorkspaceRootIconMetadataPatch> {
    const sourcePath = path.resolve(input.sourceAbsolutePath.trim());
    const extension = path.extname(sourcePath).toLowerCase();
    const mimeType = mimeTypeForExtension(extension);
    if (!mimeType || !MANUAL_ICON_EXTENSIONS.has(extension)) {
        throw new Error('Workspace icon override must be a PNG, ICO, or safe SVG file.');
    }

    const sourceRealPath = await realpath(sourcePath);
    const info = await stat(sourceRealPath);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_ICON_BYTES) {
        throw new Error('Workspace icon override must be a readable image file under 1 MB.');
    }

    const bytes = await readFile(sourceRealPath);
    if (extension === '.svg' && !isSvgSafe(bytes.toString('utf8'))) {
        throw new Error('Workspace icon override SVG contains unsupported active content.');
    }

    const digest = sha256Hex(bytes);
    const storageRelativePath = path.join(
        'workspace-icons',
        input.profileId,
        input.workspaceFingerprint,
        `${digest}${extension}`
    );
    const destinationPath = resolveGlobalAssetPath(storageRelativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    const tempPath = `${destinationPath}.tmp`;
    await writeFile(tempPath, bytes);
    await rename(tempPath, destinationPath);

    return {
        iconKind: 'manual',
        iconManualStorageRelativePath: storageRelativePath,
        iconManualMimeType: mimeType,
        iconManualSha256: digest,
        iconUpdatedAt: nowIso(),
    };
}

async function buildDetectedIconPatch(workspaceRootPath: string): Promise<WorkspaceRootIconMetadataPatch> {
    const detected = await detectWorkspaceIcon(workspaceRootPath);
    if (!detected) {
        return {
            iconKind: 'fallback',
            iconUpdatedAt: nowIso(),
        };
    }

    return {
        iconKind: 'detected',
        iconSourceKind: detected.sourceKind,
        iconDetectedRelativePath: detected.relativePath,
        iconUpdatedAt: nowIso(),
    };
}

async function readDetectedPayload(workspaceRoot: WorkspaceRootAssetMetadata): Promise<WorkspaceIconPayload | null> {
    if (!workspaceRoot.iconDetectedRelativePath) {
        return null;
    }
    const relativePath = await validateWorkspaceIconCandidate({
        workspaceRootPath: workspaceRoot.absolutePath,
        relativePath: workspaceRoot.iconDetectedRelativePath,
    });
    if (!relativePath) {
        return null;
    }
    const extension = path.extname(relativePath).toLowerCase();
    const mimeType = mimeTypeForExtension(extension);
    if (!mimeType) {
        return null;
    }
    const rootRealPath = await realpath(workspaceRoot.absolutePath);
    const absolutePath = path.join(rootRealPath, relativePath);
    return {
        bytes: await readFile(absolutePath),
        mimeType,
    };
}

async function readManualPayload(workspaceRoot: WorkspaceRootAssetMetadata): Promise<WorkspaceIconPayload | null> {
    if (!workspaceRoot.iconManualStorageRelativePath || !workspaceRoot.iconManualMimeType) {
        return null;
    }
    try {
        const absolutePath = resolveGlobalAssetPath(workspaceRoot.iconManualStorageRelativePath);
        const info = await stat(absolutePath);
        if (!info.isFile() || info.size <= 0 || info.size > MAX_ICON_BYTES) {
            return null;
        }
        return {
            bytes: await readFile(absolutePath),
            mimeType: workspaceRoot.iconManualMimeType,
        };
    } catch {
        return null;
    }
}

async function removeManualIconAsset(workspaceRoot: WorkspaceRootAssetMetadata | null): Promise<void> {
    if (!workspaceRoot?.iconManualStorageRelativePath) {
        return;
    }
    await rm(resolveGlobalAssetPath(workspaceRoot.iconManualStorageRelativePath), { force: true });
}

class WorkspaceIconService {
    async registerWorkspaceRoot(input: RuntimeRegisterWorkspaceRootInput): Promise<RuntimeRegisterWorkspaceRootResult> {
        const workspaceRoot = await workspaceRootStore.resolveOrCreate(
            input.profileId,
            input.absolutePath,
            input.label
        );
        if (workspaceRoot.workspaceIconSummary.kind === 'manual') {
            return { workspaceRoot };
        }
        const icon = await buildDetectedIconPatch(workspaceRoot.absolutePath);
        const refreshed = await workspaceRootStore.updateMetadata({
            profileId: input.profileId,
            fingerprint: workspaceRoot.fingerprint,
            icon,
        });
        return {
            workspaceRoot: refreshed ?? workspaceRoot,
        };
    }

    async patchWorkspaceRoot(
        input: RuntimePatchWorkspaceRootInput
    ): Promise<OperationalResult<RuntimePatchWorkspaceRootResult>> {
        try {
            const workspaceRoot = await workspaceRootStore.getByFingerprint(
                input.profileId,
                input.workspaceFingerprint
            );
            if (!workspaceRoot) {
                return errOp('not_found', 'Workspace root was not found.');
            }

            const existingAssetMetadata = await workspaceRootStore.getAssetMetadata(
                input.profileId,
                input.workspaceFingerprint
            );
            if (input.iconAction?.kind === 'refresh_detected') {
                const icon = await buildDetectedIconPatch(workspaceRoot.absolutePath);
                const updated = await workspaceRootStore.updateDetectedIconMetadata({
                    profileId: input.profileId,
                    fingerprint: input.workspaceFingerprint,
                    ...(input.label !== undefined ? { label: input.label } : {}),
                    ...(icon.iconSourceKind ? { iconSourceKind: icon.iconSourceKind } : {}),
                    ...(icon.iconDetectedRelativePath
                        ? { iconDetectedRelativePath: icon.iconDetectedRelativePath }
                        : {}),
                    iconUpdatedAt: icon.iconUpdatedAt,
                });
                if (!updated) {
                    return errOp('not_found', 'Workspace root was not found.');
                }
                return okOp({ workspaceRoot: updated });
            }

            let icon: WorkspaceRootIconMetadataPatch | undefined;
            if (input.iconAction?.kind === 'set_manual') {
                icon = await copyManualIcon({
                    profileId: input.profileId,
                    workspaceFingerprint: input.workspaceFingerprint,
                    sourceAbsolutePath: input.iconAction.sourceAbsolutePath,
                });
            } else if (input.iconAction?.kind === 'clear_manual') {
                icon = await buildDetectedIconPatch(workspaceRoot.absolutePath);
            }

            const updated = await workspaceRootStore.updateMetadata({
                profileId: input.profileId,
                fingerprint: input.workspaceFingerprint,
                ...(input.label !== undefined ? { label: input.label } : {}),
                ...(icon ? { icon } : {}),
            });
            if (!updated) {
                return errOp('not_found', 'Workspace root was not found.');
            }

            if (input.iconAction?.kind === 'set_manual' || input.iconAction?.kind === 'clear_manual') {
                await removeManualIconAsset(existingAssetMetadata);
            }

            return okOp({ workspaceRoot: updated });
        } catch (error) {
            const operationalError = toOperationalError(error, 'invalid_input', 'Workspace icon update failed.');
            return errOp(operationalError.code, operationalError.message);
        }
    }

    async resolveIconPayload(input: {
        profileId: string;
        workspaceFingerprint: string;
    }): Promise<WorkspaceIconPayload> {
        const workspaceRoot = await workspaceRootStore.getAssetMetadata(input.profileId, input.workspaceFingerprint);
        if (!workspaceRoot) {
            return fallbackIconPayload();
        }
        if (workspaceRoot.iconKind === 'manual') {
            return (await readManualPayload(workspaceRoot)) ?? fallbackIconPayload();
        }
        if (workspaceRoot.iconKind === 'detected') {
            return (await readDetectedPayload(workspaceRoot)) ?? fallbackIconPayload();
        }
        return fallbackIconPayload();
    }
}

export const workspaceIconService = new WorkspaceIconService();
export const workspaceIconTesting = {
    detectWorkspaceIcon,
    validateWorkspaceIconCandidate,
    fallbackIconPayload,
};
