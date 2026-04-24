import { createHash } from 'node:crypto';

import type { MemoryRecord } from '@/app/backend/persistence/types';
import { memoryStates, type MemoryState } from '@/app/backend/runtime/contracts';
import type { MemoryCanonicalBody } from '@/app/backend/runtime/contracts';
import { readEnumValue } from '@/app/backend/runtime/contracts/parsers/helpers';
import {
    createMemoryCanonicalBodyFromMarkdown,
    renderMemoryCanonicalBodyMarkdown,
} from '@/app/backend/runtime/services/memory/memoryCanonicalBody';

interface ParsedFrontmatter {
    attributes: Record<string, unknown>;
    bodyMarkdown: string;
}

export interface ParsedMemoryProposal {
    title: string;
    canonicalBody: MemoryCanonicalBody;
    bodyMarkdown: string;
    summaryText?: string;
    metadata: Record<string, unknown>;
    proposedState: MemoryState;
}

export function normalizeContent(content: string): string {
    return content.replace(/\r\n?/g, '\n');
}

export function hashContent(content: string): string {
    return createHash('sha256').update(normalizeContent(content)).digest('hex');
}

function stripQuotes(value: string): string {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function parseScalar(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return '';
    }
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
        return JSON.parse(trimmed);
    }
    if (trimmed === 'true') {
        return true;
    }
    if (trimmed === 'false') {
        return false;
    }
    if (trimmed === 'null') {
        return null;
    }
    if (/^-?\d+$/.test(trimmed)) {
        return Number.parseInt(trimmed, 10);
    }

    return stripQuotes(trimmed);
}

function parseFrontmatter(markdown: string): ParsedFrontmatter {
    const normalized = normalizeContent(markdown);
    if (!normalized.startsWith('---\n')) {
        throw new Error('Projected memory file must start with frontmatter.');
    }

    const closingIndex = normalized.indexOf('\n---\n', 4);
    if (closingIndex < 0) {
        throw new Error('Projected memory file is missing a closing frontmatter delimiter.');
    }

    const headerLines = normalized.slice(4, closingIndex).split('\n');
    const bodyMarkdown = normalized.slice(closingIndex + '\n---\n'.length).trim();
    const attributes: Record<string, unknown> = {};

    for (const line of headerLines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }

        const separatorIndex = trimmed.indexOf(':');
        if (separatorIndex <= 0) {
            throw new Error(`Invalid frontmatter line: "${trimmed}".`);
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        attributes[key] = parseScalar(rawValue);
    }

    return {
        attributes,
        bodyMarkdown,
    };
}

function serializeFrontmatterValue(value: unknown): string {
    if (typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (value === null) {
        return 'null';
    }

    return JSON.stringify(value);
}

export function toProjectionFileName(memory: MemoryRecord): string {
    return `${memory.scopeKind}--${memory.id}.md`;
}

export function renderProjectedMemoryFile(memory: MemoryRecord): string {
    const frontmatterEntries: Array<[string, unknown]> = [
        ['id', memory.id],
        ['memoryType', memory.memoryType],
        ['scopeKind', memory.scopeKind],
        ['state', memory.state],
        ['title', memory.title],
        ['memoryRetentionClass', memory.memoryRetentionClass],
        ['metadata', memory.metadata],
    ];

    if (memory.summaryText) {
        frontmatterEntries.push(['summaryText', memory.summaryText]);
    }
    if (memory.workspaceFingerprint) {
        frontmatterEntries.push(['workspaceFingerprint', memory.workspaceFingerprint]);
    }
    if (memory.threadId) {
        frontmatterEntries.push(['threadId', memory.threadId]);
    }
    if (memory.runId) {
        frontmatterEntries.push(['runId', memory.runId]);
    }
    if (memory.retentionExpiresAt) {
        frontmatterEntries.push(['retentionExpiresAt', memory.retentionExpiresAt]);
    }
    if (memory.retentionPinnedAt) {
        frontmatterEntries.push(['retentionPinnedAt', memory.retentionPinnedAt]);
    }
    if (memory.retentionSupersedenceRationale) {
        frontmatterEntries.push(['retentionSupersedenceRationale', memory.retentionSupersedenceRationale]);
    }

    const header = frontmatterEntries.map(([key, value]) => `${key}: ${serializeFrontmatterValue(value)}`).join('\n');

    return normalizeContent(`---\n${header}\n---\n${renderMemoryCanonicalBodyMarkdown(memory.canonicalBody)}\n`);
}

function readRequiredString(attributes: Record<string, unknown>, field: string): string {
    const value = attributes[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Invalid "${field}": expected non-empty string.`);
    }

    return value.trim();
}

function readOptionalString(attributes: Record<string, unknown>, field: string): string | undefined {
    const value = attributes[field];
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error(`Invalid "${field}": expected string.`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function readObject(attributes: Record<string, unknown>, field: string): Record<string, unknown> {
    const value = attributes[field];
    if (value === undefined) {
        return {};
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Invalid "${field}": expected object.`);
    }

    return Object.fromEntries(Object.entries(value));
}

function readExactValue(attributes: Record<string, unknown>, field: string, expected: string | undefined): void {
    const value = readOptionalString(attributes, field);
    if ((expected ?? undefined) !== value) {
        throw new Error(`Projected memory "${field}" cannot be changed from the canonical value.`);
    }
}

export function readParsedState(attributes: Record<string, unknown>): MemoryRecord['state'] {
    return readEnumValue(attributes['state'], 'state', memoryStates);
}

export function parseMemoryProposal(memory: MemoryRecord, content: string): ParsedMemoryProposal {
    const parsed = parseFrontmatter(content);
    const attributes = parsed.attributes;
    const memoryId = readRequiredString(attributes, 'id');
    if (memoryId !== memory.id) {
        throw new Error('Projected memory "id" cannot be changed.');
    }

    const memoryType = readRequiredString(attributes, 'memoryType');
    if (memoryType !== memory.memoryType) {
        throw new Error('Projected memory "memoryType" cannot be changed.');
    }

    const scopeKind = readRequiredString(attributes, 'scopeKind');
    if (scopeKind !== memory.scopeKind) {
        throw new Error('Projected memory "scopeKind" cannot be changed.');
    }

    readExactValue(attributes, 'workspaceFingerprint', memory.workspaceFingerprint);
    readExactValue(attributes, 'threadId', memory.threadId);
    readExactValue(attributes, 'runId', memory.runId);
    readExactValue(attributes, 'memoryRetentionClass', memory.memoryRetentionClass);
    readExactValue(attributes, 'retentionExpiresAt', memory.retentionExpiresAt);
    readExactValue(attributes, 'retentionPinnedAt', memory.retentionPinnedAt);
    readExactValue(attributes, 'retentionSupersedenceRationale', memory.retentionSupersedenceRationale);

    const title = readRequiredString(attributes, 'title');
    const bodyMarkdown = parsed.bodyMarkdown.trim();
    const summaryText = readOptionalString(attributes, 'summaryText');
    if (bodyMarkdown.length === 0) {
        throw new Error('Projected memory body cannot be empty.');
    }

    return {
        title,
        canonicalBody: createMemoryCanonicalBodyFromMarkdown(bodyMarkdown),
        bodyMarkdown,
        ...(summaryText ? { summaryText } : {}),
        metadata: readObject(attributes, 'metadata'),
        proposedState: readParsedState(attributes),
    };
}
