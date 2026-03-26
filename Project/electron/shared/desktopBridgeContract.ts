export const PICK_DIRECTORY_CHANNEL = 'neonconductor:desktop:pick-directory';

export type PickDirectoryResult = { canceled: true } | { canceled: false; absolutePath: string };

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
