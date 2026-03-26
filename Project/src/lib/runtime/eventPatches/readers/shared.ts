export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

export function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readLiteral<TValue extends string>(
    value: unknown,
    allowedValues: readonly TValue[]
): TValue | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    for (const allowedValue of allowedValues) {
        if (allowedValue === value) {
            return allowedValue;
        }
    }

    return undefined;
}

export function readStringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
}

export function hasRequiredStringFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
    return fields.every((field) => readString(value[field]));
}
