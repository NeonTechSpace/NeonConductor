export const PICK_DIRECTORY_CHANNEL = 'neonconductor:desktop:pick-directory';
export const DEV_BROWSER_SYNC_MOUNT_CHANNEL = 'neonconductor:desktop:dev-browser:sync-mount';
export const DEV_BROWSER_PICKER_CHANNEL = 'neonconductor:desktop:dev-browser:picker';
export const DEV_BROWSER_SELECTION_CHANNEL = 'neonconductor:desktop:dev-browser:selection';

export type PickDirectoryResult = { canceled: true } | { canceled: false; absolutePath: string };

export interface DevBrowserMountPayload {
    profileId: string;
    sessionId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
}

export interface DevBrowserSelectionPayload {
    pageIdentity: string;
    pageUrl: string;
    pageTitle?: string;
    selector: {
        primary: string;
        path: string[];
    };
    ancestryTrail: Array<{
        tagName: string;
        selector: string;
        accessibleLabel?: string;
        accessibleRole?: string;
    }>;
    accessibleLabel?: string;
    accessibleRole?: string;
    textExcerpt?: string;
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

export function isPickDirectoryResult(value: unknown): value is PickDirectoryResult {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    if (candidate['canceled'] === true) {
        return true;
    }

    return (
        candidate['canceled'] === false &&
        typeof candidate['absolutePath'] === 'string' &&
        candidate['absolutePath'].trim().length > 0
    );
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function isDevBrowserMountPayload(value: unknown): value is DevBrowserMountPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate['profileId'] === 'string' &&
        candidate['profileId'].trim().length > 0 &&
        typeof candidate['sessionId'] === 'string' &&
        candidate['sessionId'].trim().length > 0 &&
        isFiniteNumber(candidate['x']) &&
        isFiniteNumber(candidate['y']) &&
        isFiniteNumber(candidate['width']) &&
        isFiniteNumber(candidate['height']) &&
        typeof candidate['visible'] === 'boolean'
    );
}

export function isDevBrowserSelectionPayload(value: unknown): value is DevBrowserSelectionPayload {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    const selector = candidate['selector'];
    const bounds = candidate['bounds'];
    return (
        typeof candidate['pageIdentity'] === 'string' &&
        candidate['pageIdentity'].trim().length > 0 &&
        typeof candidate['pageUrl'] === 'string' &&
        candidate['pageUrl'].trim().length > 0 &&
        typeof selector === 'object' &&
        selector !== null &&
        !Array.isArray(selector) &&
        typeof (selector as Record<string, unknown>)['primary'] === 'string' &&
        Array.isArray((selector as Record<string, unknown>)['path']) &&
        Array.isArray(candidate['ancestryTrail']) &&
        typeof bounds === 'object' &&
        bounds !== null &&
        !Array.isArray(bounds) &&
        isFiniteNumber((bounds as Record<string, unknown>)['x']) &&
        isFiniteNumber((bounds as Record<string, unknown>)['y']) &&
        isFiniteNumber((bounds as Record<string, unknown>)['width']) &&
        isFiniteNumber((bounds as Record<string, unknown>)['height'])
    );
}
