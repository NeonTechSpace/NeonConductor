import * as electronModule from 'electron';
import { createRequire } from 'node:module';

export type ElectronRuntimeApi = typeof import('electron');

const requireFromElectronRuntimeResolver = createRequire(import.meta.url);
export const ELECTRON_MAIN_API_UNAVAILABLE_MESSAGE =
    'Electron main-process API is unavailable. If ELECTRON_RUN_AS_NODE=1 is inherited from the caller environment, Electron runs as Node and the electron package resolves to the launcher path instead of the desktop runtime API. Use `pnpm run desktop:launch` for built desktop validation.';

function isElectronRuntimeApi(value: unknown): value is ElectronRuntimeApi {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<ElectronRuntimeApi>;
    return (
        Object.prototype.hasOwnProperty.call(candidate, 'app') &&
        Object.prototype.hasOwnProperty.call(candidate, 'BrowserWindow') &&
        Object.prototype.hasOwnProperty.call(candidate, 'dialog') &&
        Object.prototype.hasOwnProperty.call(candidate, 'ipcMain') &&
        candidate.app !== undefined &&
        candidate.BrowserWindow !== undefined &&
        candidate.dialog !== undefined &&
        candidate.ipcMain !== undefined
    );
}

function getDefaultExport(value: unknown): unknown {
    if (typeof value !== 'object' || value === null) {
        return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(value, 'default')) {
        return undefined;
    }

    return (value as { default?: unknown }).default;
}

function getRuntimeValue<K extends keyof ElectronRuntimeApi>(value: unknown, key: K): ElectronRuntimeApi[K] | null {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
        return null;
    }

    if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return null;
    }

    const runtimeValue = (value as Partial<ElectronRuntimeApi>)[key];
    return runtimeValue === undefined ? null : (runtimeValue as ElectronRuntimeApi[K]);
}

function requireElectronModule(): unknown {
    return requireFromElectronRuntimeResolver('electron');
}

export function resolveElectronRuntimeApi(moduleValue: unknown = electronModule): ElectronRuntimeApi {
    if (isElectronRuntimeApi(moduleValue)) {
        return moduleValue;
    }

    const defaultExport = getDefaultExport(moduleValue);
    if (isElectronRuntimeApi(defaultExport)) {
        return defaultExport;
    }

    const requiredModule = requireElectronModule();
    if (isElectronRuntimeApi(requiredModule)) {
        return requiredModule;
    }

    const requiredDefaultExport = getDefaultExport(requiredModule);
    if (isElectronRuntimeApi(requiredDefaultExport)) {
        return requiredDefaultExport;
    }

    throw new Error(ELECTRON_MAIN_API_UNAVAILABLE_MESSAGE);
}

export function resolveElectronRuntimeValue<K extends keyof ElectronRuntimeApi>(
    key: K,
    moduleValue: unknown = electronModule
): ElectronRuntimeApi[K] {
    const directValue = getRuntimeValue(moduleValue, key);
    if (directValue !== null) {
        return directValue;
    }

    const defaultValue = getRuntimeValue(getDefaultExport(moduleValue), key);
    if (defaultValue !== null) {
        return defaultValue;
    }

    const requiredModule = requireElectronModule();
    const requiredValue = getRuntimeValue(requiredModule, key);
    if (requiredValue !== null) {
        return requiredValue;
    }

    const requiredDefaultValue = getRuntimeValue(getDefaultExport(requiredModule), key);
    if (requiredDefaultValue !== null) {
        return requiredDefaultValue;
    }

    throw new Error(ELECTRON_MAIN_API_UNAVAILABLE_MESSAGE);
}
