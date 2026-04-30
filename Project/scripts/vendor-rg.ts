import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    resolveVendoredRipgrepTargetKey,
    vendoredRipgrepTargets,
    type VendoredRipgrepTargetKey,
} from '@/shared/tooling/vendoredRipgrep';

import { scriptLog } from '@/scripts/logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRootPath = path.resolve(__dirname, '..');
const vendorRootPath = path.resolve(projectRootPath, 'vendor', 'rg');

interface TargetInstallMetadata {
    archiveFileName: string;
    downloadedAt: string;
}

function parseRequestedTargets(argv: string[]): VendoredRipgrepTargetKey[] {
    const explicitTargets = argv
        .map((argument) => argument.match(/^--target=(.+)$/u)?.[1])
        .filter((value): value is VendoredRipgrepTargetKey => value !== undefined && value in vendoredRipgrepTargets);

    if (explicitTargets.length > 0) {
        return [...new Set(explicitTargets)];
    }

    const inferredTarget = resolveVendoredRipgrepTargetKey({
        platform: process.platform,
        arch: process.arch,
    });
    if (!inferredTarget) {
        throw new Error(`No vendored ripgrep target is configured for ${process.platform}/${process.arch}.`);
    }

    return [inferredTarget];
}

function readInstalledMetadata(targetKey: VendoredRipgrepTargetKey): TargetInstallMetadata | null {
    const metadataPath = path.join(vendorRootPath, targetKey, 'metadata.json');
    if (!existsSync(metadataPath)) {
        return null;
    }

    try {
        return JSON.parse(readFileSync(metadataPath, 'utf8')) as TargetInstallMetadata;
    } catch {
        return null;
    }
}

function ensureTargetDirectory(targetKey: VendoredRipgrepTargetKey): string {
    const targetDirectoryPath = path.join(vendorRootPath, targetKey);
    mkdirSync(targetDirectoryPath, { recursive: true });
    return targetDirectoryPath;
}

function findExecutablePath(rootPath: string, executableName: string): string | null {
    const queue = [rootPath];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
            continue;
        }

        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                queue.push(entryPath);
                continue;
            }

            if (entry.isFile() && entry.name === executableName) {
                return entryPath;
            }
        }
    }

    return null;
}

async function runExtractionCommand(archivePath: string, destinationPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const child = spawn('tar', ['-xf', archivePath, '-C', destinationPath], {
            windowsHide: true,
        });

        let stderr = '';
        child.stderr.on('data', (chunk: Buffer | string) => {
            stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        });

        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(stderr.trim().length > 0 ? stderr.trim() : `tar exited with code ${String(code)}.`));
        });
    });
}

async function downloadFile(url: string, destinationPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new Error(`Failed to download ${url} (${String(response.status)} ${response.statusText}).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    writeFileSync(destinationPath, Buffer.from(arrayBuffer));
}

async function installTarget(targetKey: VendoredRipgrepTargetKey): Promise<void> {
    const target = vendoredRipgrepTargets[targetKey];
    const installedMetadata = readInstalledMetadata(targetKey);
    const targetDirectoryPath = ensureTargetDirectory(targetKey);
    const executablePath = path.join(targetDirectoryPath, target.executableName);
    if (installedMetadata?.archiveFileName === target.archiveFileName && existsSync(executablePath)) {
        scriptLog.info({
            tag: 'vendor-rg',
            message: 'Vendored ripgrep target is already up to date.',
            targetKey,
            executablePath,
        });
        return;
    }

    const tempDirectoryPath = await mkdtemp(path.join(os.tmpdir(), `neon-rg-${targetKey}-`));
    const archivePath = path.join(tempDirectoryPath, target.archiveFileName);
    const extractDirectoryPath = path.join(tempDirectoryPath, 'extract');
    mkdirSync(extractDirectoryPath, { recursive: true });

    try {
        scriptLog.info({
            tag: 'vendor-rg',
            message: 'Downloading vendored ripgrep target.',
            targetKey,
            downloadUrl: target.downloadUrl,
        });
        await downloadFile(target.downloadUrl, archivePath);
        await runExtractionCommand(archivePath, extractDirectoryPath);

        const extractedExecutablePath = findExecutablePath(extractDirectoryPath, target.executableName);
        if (!extractedExecutablePath) {
            throw new Error(`Could not find ${target.executableName} inside ${target.archiveFileName}.`);
        }

        await copyFile(extractedExecutablePath, executablePath);
        if (target.executableName === 'rg') {
            chmodSync(executablePath, 0o755);
        }

        writeFileSync(
            path.join(targetDirectoryPath, 'metadata.json'),
            JSON.stringify(
                {
                    archiveFileName: target.archiveFileName,
                    downloadedAt: new Date().toISOString(),
                } satisfies TargetInstallMetadata,
                null,
                2
            ),
            'utf8'
        );
        scriptLog.info({
            tag: 'vendor-rg',
            message: 'Installed vendored ripgrep target.',
            targetKey,
            executablePath,
        });
    } finally {
        await rm(tempDirectoryPath, { recursive: true, force: true });
    }
}

async function main(): Promise<void> {
    const requestedTargets = parseRequestedTargets(process.argv.slice(2));
    mkdirSync(vendorRootPath, { recursive: true });

    for (const targetKey of requestedTargets) {
        await installTarget(targetKey);
    }
}

main().catch((error: unknown) => {
    scriptLog.error({
        tag: 'vendor-rg',
        message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
});
