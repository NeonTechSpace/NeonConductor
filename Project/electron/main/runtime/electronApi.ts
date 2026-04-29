import * as electronModule from 'electron';
import { createRequire } from 'node:module';

type ElectronRuntimeApi = typeof import('electron');

const requireFromElectronApi = createRequire(import.meta.url);
export const ELECTRON_MAIN_API_UNAVAILABLE_MESSAGE =
    'Electron main-process API is unavailable. If ELECTRON_RUN_AS_NODE=1 is inherited from the caller environment, Electron runs as Node and the electron package resolves to the launcher path instead of the desktop runtime API. Use `pnpm run launch:desktop` for built desktop validation.';

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

function requireElectronModule(): unknown {
    return requireFromElectronApi('electron');
}

function resolveElectronRuntimeApi(moduleValue: unknown): ElectronRuntimeApi {
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

const electronApi = resolveElectronRuntimeApi(electronModule);

export const app = electronApi.app;
export const BrowserWindow = electronApi.BrowserWindow;
export const Menu = electronApi.Menu;
export const dialog = electronApi.dialog;
export const ipcMain = electronApi.ipcMain;
export const session = electronApi.session;
export const shell = electronApi.shell;
export const WebContentsView = electronApi.WebContentsView;

export type {
    BrowserWindow as BrowserWindowType,
    Input,
    OpenDialogOptions,
    WebContentsView as WebContentsViewType,
} from 'electron';
