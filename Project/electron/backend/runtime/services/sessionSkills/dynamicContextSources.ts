import { createHash } from 'node:crypto';

import type {
    SkillDynamicContextSafetyClass,
    SkillDynamicContextSource,
} from '@/app/backend/runtime/contracts';

const MAX_TIMEOUT_MS = 60_000;
const MAX_CAPTURE_BYTES = 12_000;
const MAX_CAPTURE_LINES = 400;
const INVALID_SOURCE_PREFIX = 'dynamic_source_';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function readPositiveInteger(value: unknown, max: number): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined;
    }

    const normalized = Math.floor(value);
    if (normalized < 1 || normalized > max) {
        return undefined;
    }

    return normalized;
}

function tokenizeCommand(command: string): string[] {
    const matches = command.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [];
    return matches
        .map((token) => token.trim())
        .map((token) => {
            if (token.length >= 2) {
                const first = token[0];
                const last = token[token.length - 1];
                if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
                    return token.slice(1, -1);
                }
            }
            return token;
        })
        .filter((token) => token.length > 0);
}

function containsRejectedShellOperators(command: string): boolean {
    return (
        /[\r\n]/u.test(command) ||
        /&&|\|\||[;|<>`]/u.test(command) ||
        /\$\(|\$\{/u.test(command)
    );
}

function isClearlyReadOnlyCommand(command: string): boolean {
    const tokens = tokenizeCommand(command);
    if (tokens.length === 0) {
        return false;
    }

    const executable = tokens[0]?.toLowerCase();
    const verb = tokens[1]?.toLowerCase();
    if (!executable) {
        return false;
    }

    if (
        executable === 'pwd' ||
        executable === 'ls' ||
        executable === 'dir' ||
        executable === 'rg' ||
        executable === 'cat' ||
        executable === 'type' ||
        executable === 'get-childitem' ||
        executable === 'get-content'
    ) {
        return true;
    }

    if (executable === 'git') {
        return (
            verb === 'status' ||
            verb === 'diff' ||
            verb === 'log' ||
            verb === 'show' ||
            verb === 'branch' ||
            verb === 'rev-parse' ||
            verb === 'remote' ||
            verb === 'ls-files'
        );
    }

    if (executable === 'jj') {
        return (
            verb === 'status' ||
            verb === 'diff' ||
            verb === 'log' ||
            verb === 'show' ||
            verb === 'root' ||
            verb === 'file'
        );
    }

    return false;
}

function buildInvalidSource(input: {
    index: number;
    id?: string | undefined;
    label?: string | undefined;
    command?: string | undefined;
    declaredSafetyClass?: SkillDynamicContextSafetyClass | undefined;
    required?: boolean | undefined;
    timeoutMs?: number | undefined;
    maxBytes?: number | undefined;
    maxLines?: number | undefined;
    message: string;
}): SkillDynamicContextSource {
    return {
        id: input.id ?? `${INVALID_SOURCE_PREFIX}${String(input.index + 1)}`,
        label: input.label ?? `Dynamic source ${String(input.index + 1)}`,
        command: input.command ?? '',
        declaredSafetyClass: input.declaredSafetyClass ?? 'unsafe',
        required: input.required ?? false,
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
        ...(input.maxLines !== undefined ? { maxLines: input.maxLines } : {}),
        validationState: 'invalid',
        validationMessage: input.message,
    };
}

export function buildSkillDynamicCommandDigest(command: string): string {
    const normalized = command.trim().replace(/\s+/g, ' ');
    return `dynctxcmd-${createHash('sha256').update(normalized).digest('hex').slice(0, 24)}`;
}

export function normalizeSkillDynamicContextSources(value: unknown): SkillDynamicContextSource[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            return buildInvalidSource({
                index,
                message: 'Dynamic context source must be an object entry.',
            });
        }

        const id = readString(entry['id']);
        const label = readString(entry['label']);
        const command = readString(entry['command']);
        const declaredSafetyClassValue = readString(entry['declaredSafetyClass']);
        const required = readBoolean(entry['required']);
        const timeoutMs = readPositiveInteger(entry['timeoutMs'], MAX_TIMEOUT_MS);
        const maxBytes = readPositiveInteger(entry['maxBytes'], MAX_CAPTURE_BYTES);
        const maxLines = readPositiveInteger(entry['maxLines'], MAX_CAPTURE_LINES);

        const declaredSafetyClass =
            declaredSafetyClassValue === 'safe' || declaredSafetyClassValue === 'unsafe'
                ? declaredSafetyClassValue
                : undefined;

        if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(id)) {
            return buildInvalidSource({
                index,
                id,
                label,
                command,
                declaredSafetyClass,
                required,
                timeoutMs,
                maxBytes,
                maxLines,
                message: 'Dynamic context source id must be alphanumeric and may include "_" or "-".',
            });
        }
        if (!label) {
            return buildInvalidSource({
                index,
                id,
                command,
                declaredSafetyClass,
                required,
                timeoutMs,
                maxBytes,
                maxLines,
                message: 'Dynamic context source label is required.',
            });
        }
        if (!command) {
            return buildInvalidSource({
                index,
                id,
                label,
                declaredSafetyClass,
                required,
                timeoutMs,
                maxBytes,
                maxLines,
                message: 'Dynamic context source command is required.',
            });
        }
        if (!declaredSafetyClass) {
            return buildInvalidSource({
                index,
                id,
                label,
                command,
                required,
                timeoutMs,
                maxBytes,
                maxLines,
                message: 'Dynamic context source declaredSafetyClass must be "safe" or "unsafe".',
            });
        }
        if (required === undefined) {
            return buildInvalidSource({
                index,
                id,
                label,
                command,
                declaredSafetyClass,
                timeoutMs,
                maxBytes,
                maxLines,
                message: 'Dynamic context source required flag must be true or false.',
            });
        }
        if (containsRejectedShellOperators(command)) {
            return buildInvalidSource({
                index,
                id,
                label,
                command,
                declaredSafetyClass,
                required,
                timeoutMs,
                maxBytes,
                maxLines,
                message: 'Dynamic context source command must be a single shell command without chaining or redirection operators.',
            });
        }

        const effectiveSafetyClass: SkillDynamicContextSafetyClass =
            declaredSafetyClass === 'unsafe' || !isClearlyReadOnlyCommand(command) ? 'unsafe' : 'safe';

        return {
            id,
            label,
            command,
            declaredSafetyClass,
            required,
            ...(timeoutMs !== undefined ? { timeoutMs } : {}),
            ...(maxBytes !== undefined ? { maxBytes } : {}),
            ...(maxLines !== undefined ? { maxLines } : {}),
            validationState: 'valid',
            effectiveSafetyClass,
        };
    });
}
