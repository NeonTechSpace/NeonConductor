import * as electronModule from 'electron';

type ElectronRuntimeApi = typeof import('electron');

const electronModuleRecord: typeof electronModule & { default?: ElectronRuntimeApi } = electronModule;
const electronApi: ElectronRuntimeApi = Object.prototype.hasOwnProperty.call(electronModuleRecord, 'default')
    ? (electronModuleRecord.default ?? electronModuleRecord)
    : electronModuleRecord;

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
