export function nowIso(): string {
    return new Date().toISOString();
}

export function parseJsonValue<T>(input: string, fallback: T): T {
    try {
        return JSON.parse(input) as T;
    } catch {
        return fallback;
    }
}
