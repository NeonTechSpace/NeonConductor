import { queryClient } from '@/web/lib/providers/trpcCore';

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function queryKeyContainsSegments(value: unknown, segments: readonly string[]): boolean {
    if (segments.length === 0) {
        return true;
    }

    if (Array.isArray(value)) {
        return segments.every((segment) => value.some((entry) => queryKeyContainsSegments(entry, [segment])));
    }

    if (isRecord(value)) {
        return Object.values(value).some((entry) => queryKeyContainsSegments(entry, segments));
    }

    return typeof value === 'string' && segments.includes(value);
}

export function updateMatchingQueryData<TData>(
    pathSegments: readonly string[],
    updater: (current: TData | undefined) => TData | undefined
): void {
    queryClient.setQueriesData<TData>(
        {
            predicate: (query) => queryKeyContainsSegments(query.queryKey, pathSegments),
        },
        updater
    );
}
