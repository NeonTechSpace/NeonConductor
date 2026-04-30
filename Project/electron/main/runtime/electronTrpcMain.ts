import { createRequire } from 'node:module';

const requireElectronTrpcMain = createRequire(import.meta.url);
const electronTrpcMain = requireElectronTrpcMain(
    'electron-trpc-experimental/main'
) as typeof import('electron-trpc-experimental/main');

export const createIPCHandler = electronTrpcMain.createIPCHandler;

export type { CreateContextOptions } from 'electron-trpc-experimental/main';
