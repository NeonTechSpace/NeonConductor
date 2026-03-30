import path from 'node:path';

export function normalizeWorkspacePath(value: string): string {
    return path.resolve(value.trim());
}

export function toWorkspacePathKey(value: string): string {
    return process.platform === 'win32' ? value.toLowerCase() : value;
}
