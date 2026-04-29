import { session } from '@/app/main/runtime/electronApi';
import { getCspHeader } from '@/app/main/security/cspPolicy';

export interface CspHeaderOptions {
    isDev: boolean;
    devServerUrl?: string;
}

export function attachCspHeaders(options: CspHeaderOptions): void {
    const { isDev, devServerUrl } = options;
    const cspOptions = isDev && devServerUrl ? { devServerUrl } : {};
    const cspHeader = getCspHeader(isDev ? 'dev' : 'prod', cspOptions);

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        // Only apply CSP to our app's content, not external resources or devtools
        const isAppContent = isDev
            ? Boolean(devServerUrl && details.url.startsWith(devServerUrl))
            : details.url.startsWith('file://');

        // Skip devtools URLs
        const isDevTools = details.url.startsWith('devtools://');

        if (isAppContent && !isDevTools) {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [cspHeader],
                },
            });
        } else {
            callback({});
        }
    });
}
