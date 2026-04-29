import { appLog } from '@/app/main/logging';
import { shell, type BrowserWindowType } from '@/app/main/runtime/electronApi';
import { isAppNavigation, isSafeExternalUrl } from '@/app/main/security/urlPolicy';

export interface NavigationGuardOptions {
    isDev: boolean;
    devServerUrl?: string;
}

export function attachNavigationGuards(win: BrowserWindowType, options: NavigationGuardOptions): void {
    const { isDev, devServerUrl } = options;

    // Security: intercept target="_blank" and window.open() to use OS browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('devtools://')) {
            return { action: 'allow' };
        }

        if (isSafeExternalUrl(url)) {
            void shell.openExternal(url);
        } else {
            appLog.warn({
                tag: 'security',
                message: `Blocked external URL: ${url}`,
                url,
            });
        }
        return { action: 'deny' };
    });

    // Security: prevent in-app navigation to external URLs
    win.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('devtools://')) {
            return;
        }

        if (isAppNavigation(url, isDev ? devServerUrl : undefined)) {
            return;
        }

        event.preventDefault();
        if (isSafeExternalUrl(url)) {
            void shell.openExternal(url);
        } else {
            appLog.warn({
                tag: 'security',
                message: `Blocked external URL: ${url}`,
                url,
            });
        }
    });
}
