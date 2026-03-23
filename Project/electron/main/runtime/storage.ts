import path from 'node:path';

export type PackagedRuntimeNamespace = 'stable' | 'beta' | 'alpha';
export type RuntimeStorageNamespace = PackagedRuntimeNamespace | 'development';

export interface ResolvedDesktopStorage {
    userDataPath: string;
    runtimeNamespace: RuntimeStorageNamespace;
    isDevIsolatedStorage: boolean;
}

export interface ResolvedDesktopStoragePaths extends ResolvedDesktopStorage {
    runtimeRoot: string;
    dbPath: string;
    logsPath: string;
}

interface ResolveDesktopStorageOptions {
    defaultUserDataPath: string;
    isDev: boolean;
    packagedRuntimeNamespace: PackagedRuntimeNamespace;
}

const DEVELOPMENT_USER_DATA_SUFFIX = '-dev';
const DEFAULT_PACKAGED_RUNTIME_NAMESPACE: PackagedRuntimeNamespace = 'stable';

function resolveConfiguredUserDataPath(): string | null {
    const configuredPath = process.env['NEONCONDUCTOR_USER_DATA_PATH']?.trim();
    if (!configuredPath) {
        return null;
    }

    return path.isAbsolute(configuredPath) ? configuredPath : null;
}

export function isPackagedRuntimeNamespace(value: unknown): value is PackagedRuntimeNamespace {
    return value === 'stable' || value === 'beta' || value === 'alpha';
}

export function isRuntimeStorageNamespace(value: unknown): value is RuntimeStorageNamespace {
    return value === 'development' || isPackagedRuntimeNamespace(value);
}

export function resolveDevelopmentUserDataPath(defaultUserDataPath: string): string {
    return `${defaultUserDataPath}${DEVELOPMENT_USER_DATA_SUFFIX}`;
}

export function resolveDesktopStorage(options: ResolveDesktopStorageOptions): ResolvedDesktopStorage {
    const runtimeNamespace: RuntimeStorageNamespace = options.isDev ? 'development' : options.packagedRuntimeNamespace;
    const configuredUserDataPath = resolveConfiguredUserDataPath();

    return {
        userDataPath:
            configuredUserDataPath ??
            (options.isDev ? resolveDevelopmentUserDataPath(options.defaultUserDataPath) : options.defaultUserDataPath),
        runtimeNamespace,
        isDevIsolatedStorage: options.isDev && configuredUserDataPath === null,
    };
}

export function resolveDesktopStoragePaths(storage: ResolvedDesktopStorage): ResolvedDesktopStoragePaths {
    const runtimeRoot = path.join(storage.userDataPath, 'runtime', storage.runtimeNamespace);

    return {
        ...storage,
        runtimeRoot,
        dbPath: path.join(runtimeRoot, 'neonconductor.db'),
        logsPath: path.join(storage.userDataPath, 'logs'),
    };
}

export function resolveRuntimeNamespaceFromEnv(
    fallback: RuntimeStorageNamespace = DEFAULT_PACKAGED_RUNTIME_NAMESPACE
): RuntimeStorageNamespace {
    const runtimeNamespace =
        process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE']?.trim() ??
        process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL']?.trim();

    return isRuntimeStorageNamespace(runtimeNamespace) ? runtimeNamespace : fallback;
}

export function resolvePackagedRuntimeNamespaceFromEnv(
    fallback: PackagedRuntimeNamespace = DEFAULT_PACKAGED_RUNTIME_NAMESPACE
): PackagedRuntimeNamespace {
    const runtimeNamespace =
        process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE']?.trim() ??
        process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL']?.trim();

    return isPackagedRuntimeNamespace(runtimeNamespace) ? runtimeNamespace : fallback;
}
