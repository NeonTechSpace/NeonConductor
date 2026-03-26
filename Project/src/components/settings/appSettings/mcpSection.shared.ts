import { isOneOf } from '@/web/lib/typeGuards/isOneOf';

import type { McpServerRecord, McpServerWorkingDirectoryMode } from '@/shared/contracts/types/mcp';

const workingDirectoryModes = ['inherit_process', 'workspace_root', 'fixed_path'] as const;

export type WorkingDirectoryMode = McpServerWorkingDirectoryMode;

export interface EnvDraftEntry {
    id: string;
    key: string;
    value: string;
}

export interface McpServerDraft {
    label: string;
    command: string;
    argsText: string;
    workingDirectoryMode: WorkingDirectoryMode;
    fixedWorkingDirectory: string;
    timeoutText: string;
    enabled: boolean;
    envEntries: EnvDraftEntry[];
}

export function createId(): string {
    return `${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyDraft(): McpServerDraft {
    return {
        label: '',
        command: '',
        argsText: '',
        workingDirectoryMode: 'inherit_process',
        fixedWorkingDirectory: '',
        timeoutText: '',
        enabled: true,
        envEntries: [],
    };
}

export function parseArgs(argsText: string): string[] {
    return argsText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

export function parseTimeout(timeoutText: string): number | undefined {
    const trimmed = timeoutText.trim();
    if (trimmed.length === 0) {
        return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function isDraftValid(draft: McpServerDraft): boolean {
    if (draft.label.trim().length === 0 || draft.command.trim().length === 0) {
        return false;
    }
    if (draft.workingDirectoryMode === 'fixed_path' && draft.fixedWorkingDirectory.trim().length === 0) {
        return false;
    }
    if (draft.timeoutText.trim().length > 0 && parseTimeout(draft.timeoutText) === undefined) {
        return false;
    }
    return true;
}

export function isWorkingDirectoryMode(value: string): value is WorkingDirectoryMode {
    return isOneOf(value, workingDirectoryModes);
}

export function createDraftFromServer(server: McpServerRecord): McpServerDraft {
    return {
        label: server.label,
        command: server.command,
        argsText: server.args.join('\n'),
        workingDirectoryMode: server.workingDirectoryMode,
        fixedWorkingDirectory: server.fixedWorkingDirectory ?? '',
        timeoutText: server.timeoutMs ? String(server.timeoutMs) : '',
        enabled: server.enabled,
        envEntries: server.envKeys.map((key) => ({
            id: createId(),
            key,
            value: '',
        })),
    };
}
