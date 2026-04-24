import { createHash } from 'node:crypto';

import type { PermissionApprovalCandidate } from '@/app/backend/persistence/types';

function normalizeCommand(command: string): string {
    return command.trim().replace(/\s+/g, ' ');
}

function buildCommandResource(command: string): string {
    const digest = createHash('sha256').update(normalizeCommand(command)).digest('hex').slice(0, 24);
    return `tool:run_command:command:${digest}`;
}

export interface ShellApprovalContext {
    commandText: string;
    commandResource: string;
    overrideResources: string[];
    approvalCandidates: PermissionApprovalCandidate[];
}

export function buildShellApprovalContext(command: string): ShellApprovalContext {
    const normalized = normalizeCommand(command);
    const commandResource = buildCommandResource(normalized);
    const approvalCandidates: PermissionApprovalCandidate[] = [
        {
            label: normalized,
            resource: commandResource,
            detail: 'Allow only this exact normalized command.',
        },
    ];

    return {
        commandText: normalized,
        commandResource,
        overrideResources: [],
        approvalCandidates,
    };
}
