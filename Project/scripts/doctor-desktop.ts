import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

import {
    resolveDesktopStorage,
    resolveDesktopStoragePaths,
    resolvePackagedRuntimeNamespaceFromEnv,
    type RuntimeStorageNamespace,
} from '@/app/main/runtime/storage';

import { scriptLog } from '@/scripts/logger';

interface PackageJsonSnapshot {
    dependencies?: Record<string, string> | undefined;
    devDependencies?: Record<string, string> | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export type DesktopDoctorScope = 'packaged' | 'development';

export interface DesktopDoctorPaths {
    scope: DesktopDoctorScope;
    userDataRoot: string;
    runtimeNamespace: RuntimeStorageNamespace;
    runtimeRoot: string;
    dbPath: string;
    logsRoot: string;
    isDevIsolatedStorage: boolean;
}

export function parseDesktopDoctorScope(argv: string[] = process.argv.slice(2)): DesktopDoctorScope {
    const scopeArgument = argv.find((argument) => argument.startsWith('--scope='));
    if (!scopeArgument) {
        return 'packaged';
    }

    const scopeValue = scopeArgument.slice('--scope='.length);
    if (scopeValue === 'packaged' || scopeValue === 'development') {
        return scopeValue;
    }

    throw new Error(`Unsupported desktop doctor scope "${scopeValue}". Expected "packaged" or "development".`);
}

export function resolveDefaultPackagedUserDataRoot(): string {
    const explicitUserDataPath = process.env['NEONCONDUCTOR_USER_DATA_PATH']?.trim();
    if (explicitUserDataPath) {
        return explicitUserDataPath;
    }

    if (process.platform === 'win32') {
        return path.join(process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'neon-conductor');
    }

    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'neon-conductor');
    }

    return path.join(process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config'), 'neon-conductor');
}

export function resolveDesktopDoctorPaths(scope: DesktopDoctorScope): DesktopDoctorPaths {
    const resolvedStorage = resolveDesktopStorage({
        defaultUserDataPath: resolveDefaultPackagedUserDataRoot(),
        isDev: scope === 'development',
        packagedRuntimeNamespace: resolvePackagedRuntimeNamespaceFromEnv(),
    });
    const storagePaths = resolveDesktopStoragePaths(resolvedStorage);

    return {
        scope,
        userDataRoot: resolvedStorage.userDataPath,
        runtimeNamespace: resolvedStorage.runtimeNamespace,
        runtimeRoot: storagePaths.runtimeRoot,
        dbPath: storagePaths.dbPath,
        logsRoot: storagePaths.logsPath,
        isDevIsolatedStorage: resolvedStorage.isDevIsolatedStorage,
    };
}

function readPackageJson(): PackageJsonSnapshot {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const parsedPackageJson: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    if (!isRecord(parsedPackageJson)) {
        throw new Error('package.json must parse to an object.');
    }
    const packageJsonRecord = parsedPackageJson;

    const dependencies = isRecord(packageJsonRecord['dependencies']) ? packageJsonRecord['dependencies'] : undefined;
    const devDependencies = isRecord(packageJsonRecord['devDependencies'])
        ? packageJsonRecord['devDependencies']
        : undefined;
    return {
        dependencies: dependencies
            ? Object.fromEntries(
                  Object.entries(dependencies).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              )
            : undefined,
        devDependencies: devDependencies
            ? Object.fromEntries(
                  Object.entries(devDependencies).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              )
            : undefined,
    };
}

function readOptionalStringField(value: unknown, fieldName: string): string | null {
    if (!isRecord(value)) {
        return null;
    }

    const fieldValue = value[fieldName];
    return typeof fieldValue === 'string' ? fieldValue : null;
}

function readOptionalNumberField(value: unknown, fieldName: string): number | null {
    if (!isRecord(value)) {
        return null;
    }

    const fieldValue = value[fieldName];
    return typeof fieldValue === 'number' ? fieldValue : null;
}

function tableExists(database: DatabaseSync, tableName: string): boolean {
    const row = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
        .get(tableName);

    return readOptionalStringField(row, 'name') === tableName;
}

function countRows(database: DatabaseSync, tableName: string): number | null {
    if (!tableExists(database, tableName)) {
        return null;
    }

    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
    return readOptionalNumberField(row, 'count') ?? 0;
}

export function runDesktopDoctor(scope = parseDesktopDoctorScope()): void {
    const packageJson = readPackageJson();
    const desktopPaths = resolveDesktopDoctorPaths(scope);
    if (!existsSync(desktopPaths.dbPath)) {
        scriptLog.info({
            tag: 'doctor.desktop',
            message: 'Desktop runtime paths resolved; no database found yet.',
            nodeVersion: process.version,
            electronVersion: packageJson.devDependencies?.['electron'] ?? 'unknown',
            ...desktopPaths,
        });
        return;
    }

    const database = new DatabaseSync(desktopPaths.dbPath, {
        readOnly: true,
    });

    try {
        const providerSecretsCount = countRows(database, 'provider_secrets');

        scriptLog.info({
            tag: 'doctor.desktop',
            message: 'Desktop runtime doctor completed.',
            nodeVersion: process.version,
            electronVersion: packageJson.devDependencies?.['electron'] ?? 'unknown',
            ...desktopPaths,
            hasProviderSecretsTable: tableExists(database, 'provider_secrets'),
            providerSecretsCount,
        });
    } finally {
        database.close();
    }
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    runDesktopDoctor();
}
