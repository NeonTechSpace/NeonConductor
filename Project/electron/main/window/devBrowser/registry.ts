import type { BrowserWindow } from 'electron';

import type { DevBrowserMountPayload, DevBrowserSelectionPayload } from '@/app/shared/desktopBridgeContract';
import { isDevBrowserSelectionPayload } from '@/app/shared/desktopBridgeContract';

import { DevBrowserWindowController, type DevBrowserWindowControllerOptions } from '@/app/main/window/devBrowser/controller';

const controllersByWindowId = new Map<number, DevBrowserWindowController>();

export function registerDevBrowserWindow(
    window: BrowserWindow,
    options: DevBrowserWindowControllerOptions
): DevBrowserWindowController {
    const existing = controllersByWindowId.get(window.id);
    if (existing) {
        return existing;
    }

    const controller = new DevBrowserWindowController(window, options);
    controllersByWindowId.set(window.id, controller);
    window.on('closed', () => {
        controllersByWindowId.delete(window.id);
    });
    return controller;
}

export function getDevBrowserController(window: BrowserWindow | null): DevBrowserWindowController | null {
    if (!window) {
        return null;
    }
    return controllersByWindowId.get(window.id) ?? null;
}

export async function syncDevBrowserMount(window: BrowserWindow | null, payload: DevBrowserMountPayload): Promise<{ ok: boolean }> {
    const controller = getDevBrowserController(window);
    if (!controller) {
        return { ok: false };
    }
    await controller.syncMount(payload);
    return { ok: true };
}

export async function handleDevBrowserSelectionFromWebContents(
    senderId: number,
    payload: unknown
): Promise<void> {
    if (!isDevBrowserSelectionPayload(payload)) {
        return;
    }

    const controller = Array.from(controllersByWindowId.values()).find(
        (candidate) => candidate.getViewWebContentsId() === senderId
    );
    if (!controller) {
        return;
    }

    await controller.handleSelectionPayload(payload as DevBrowserSelectionPayload);
}
