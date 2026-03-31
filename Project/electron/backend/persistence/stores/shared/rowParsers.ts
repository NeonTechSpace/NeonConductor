import { isEntityId, type EntityId, type EntityIdPrefix } from '@/app/backend/runtime/contracts';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAllowedString<const T extends readonly string[]>(value: string, allowedValues: T): value is T[number] {
    return allowedValues.some((allowedValue) => allowedValue === value);
}

export function parseEnumValue<const T extends readonly string[]>(
    value: string,
    field: string,
    allowedValues: T
): T[number] {
    if (isAllowedString(value, allowedValues)) {
        return value;
    }

    throw new DataCorruptionError(`Invalid "${field}" in persistence row: "${value}".`);
}

export function parseEntityId<P extends EntityIdPrefix>(value: string, field: string, prefix: P): EntityId<P> {
    const normalized = value.trim();
    if (!isEntityId(normalized, prefix)) {
        throw new DataCorruptionError(`Invalid "${field}" in persistence row: expected "${prefix}_..." ID.`);
    }

    return normalized;
}

export function parseJsonRecord(value: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(value) as unknown;
        if (isRecord(parsed)) {
            return parsed;
        }
        return {};
    } catch {
        return {};
    }
}

export function parseJsonArray(value: string): unknown[] {
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}
