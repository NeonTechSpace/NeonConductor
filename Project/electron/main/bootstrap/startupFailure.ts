import { closePersistence } from '@/app/backend/persistence/db';
import { appLog, flushAppLogger } from '@/app/main/logging';
import { app, dialog } from '@/app/main/runtime/electronApi';
import { resolveDesktopStoragePaths, resolveRuntimeNamespaceFromEnv } from '@/app/main/runtime/storage';

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return String(error);
}

function resolveKnownPaths(): { dbPath?: string; logsPath?: string } {
    const userDataPath = process.env['NEONCONDUCTOR_USER_DATA_PATH']?.trim();
    if (!userDataPath) {
        return {};
    }

    const storagePaths = resolveDesktopStoragePaths({
        userDataPath,
        runtimeNamespace: resolveRuntimeNamespaceFromEnv(),
        isDevIsolatedStorage: false,
    });

    return {
        dbPath: storagePaths.dbPath,
        logsPath: storagePaths.logsPath,
    };
}

export function resolveStartupFailureDialog(error: unknown): {
    title: string;
    message: string;
} {
    const errorMessage = getErrorMessage(error);
    const knownPaths = resolveKnownPaths();
    const pathLines = [
        knownPaths.dbPath ? `Database: ${knownPaths.dbPath}` : null,
        knownPaths.logsPath ? `Logs: ${knownPaths.logsPath}` : null,
    ].filter(Boolean);

    return {
        title: 'NeonConductor Failed To Start',
        message: `The app could not finish startup.\n\n${errorMessage}${
            pathLines.length > 0 ? `\n\n${pathLines.join('\n')}` : ''
        }\n\nInspect the logs path above for details. If startup data is corrupted, use the in-app factory reset once the app can start again.`,
    };
}

export async function handleStartupFailure(error: unknown): Promise<void> {
    const dialogContent = resolveStartupFailureDialog(error);
    const errorMessage = getErrorMessage(error);

    appLog.error({
        tag: 'runtime.startup',
        message: 'Electron main process startup failed.',
        error: errorMessage,
        dialogTitle: dialogContent.title,
    });

    closePersistence();
    dialog.showErrorBox(dialogContent.title, dialogContent.message);

    try {
        await flushAppLogger();
    } finally {
        app.exit(1);
    }
}
