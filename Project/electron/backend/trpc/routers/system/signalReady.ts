/**
 * Signals that the renderer is ready and reveals the main window.
 */

import { completeBootWindowHandoff } from '@/app/main/window/bootCoordinator';

import type { BrowserWindow } from 'electron';

export function signalReady(win: BrowserWindow | null): { success: boolean } {
    return completeBootWindowHandoff(win);
}
