export const DEV_BROWSER_PAGE_BRIDGE_REQUEST = 'neonconductor:dev-browser:react-inspect-request';
export const DEV_BROWSER_PAGE_BRIDGE_RESPONSE = 'neonconductor:dev-browser:react-inspect-response';

export interface DevBrowserPageInspectRequest {
    source: typeof DEV_BROWSER_PAGE_BRIDGE_REQUEST;
    requestId: string;
    selector: {
        primary: string;
        path: string[];
    };
}

export interface DevBrowserPageInspectResultComponent {
    displayName: string;
}

export interface DevBrowserPageInspectResult {
    source: typeof DEV_BROWSER_PAGE_BRIDGE_RESPONSE;
    requestId: string;
    found: boolean;
    componentChain?: DevBrowserPageInspectResultComponent[];
    sourceAnchor?: {
        absolutePath: string;
        displayPath?: string;
        line?: number;
        column?: number;
    };
}

export function isDevBrowserPageInspectRequest(value: unknown): value is DevBrowserPageInspectRequest {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    const selector = candidate['selector'];
    return (
        candidate['source'] === DEV_BROWSER_PAGE_BRIDGE_REQUEST &&
        typeof candidate['requestId'] === 'string' &&
        candidate['requestId'].trim().length > 0 &&
        typeof selector === 'object' &&
        selector !== null &&
        !Array.isArray(selector) &&
        typeof (selector as Record<string, unknown>)['primary'] === 'string' &&
        Array.isArray((selector as Record<string, unknown>)['path'])
    );
}

export function isDevBrowserPageInspectResult(value: unknown): value is DevBrowserPageInspectResult {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
        candidate['source'] === DEV_BROWSER_PAGE_BRIDGE_RESPONSE &&
        typeof candidate['requestId'] === 'string' &&
        typeof candidate['found'] === 'boolean'
    );
}
