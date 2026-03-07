import { createHash } from 'node:crypto';

import type { PermissionApprovalCandidate } from '@/app/backend/persistence/types';

function stripWrappingQuotes(token: string): string {
    if (token.length < 2) {
        return token;
    }

    const first = token[0];
    const last = token[token.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        return token.slice(1, -1);
    }

    return token;
}

function tokenizeCommand(command: string): string[] {
    const matches = command.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [];
    return matches.map((token) => stripWrappingQuotes(token)).filter((token) => token.length > 0);
}

function normalizeCommand(command: string): string {
    return command.trim().replace(/\s+/g, ' ');
}

function buildCommandResource(command: string): string {
    const digest = createHash('sha256').update(normalizeCommand(command)).digest('hex').slice(0, 24);
    return `tool:run_command:command:${digest}`;
}

function buildPrefixResource(prefix: string): string {
    return `tool:run_command:prefix:${prefix}`;
}

export interface ShellApprovalContext {
    commandText: string;
    commandResource: string;
    overrideResources: string[];
    approvalCandidates: PermissionApprovalCandidate[];
}

export function buildShellApprovalContext(command: string): ShellApprovalContext {
    const normalized = normalizeCommand(command);
    const tokens = tokenizeCommand(normalized);
    const executable = tokens[0] ?? '';
    const verb = tokens[1];
    const verbPrefix = executable.length > 0 && verb ? `${executable} ${verb}` : undefined;

    const approvalCandidates: PermissionApprovalCandidate[] = [];
    if (verbPrefix) {
        const prefix = verbPrefix;
        approvalCandidates.push({
            label: prefix,
            resource: buildPrefixResource(prefix),
            detail: `Allow commands that start with "${prefix}".`,
        });
    }
    if (executable) {
        approvalCandidates.push({
            label: executable,
            resource: buildPrefixResource(executable),
            detail: `Allow commands that start with "${executable}".`,
        });
    }

    return {
        commandText: normalized,
        commandResource: buildCommandResource(normalized),
        overrideResources: approvalCandidates.map((candidate) => candidate.resource),
        approvalCandidates,
    };
}
