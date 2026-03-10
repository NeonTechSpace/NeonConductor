import { SECONDARY_QUERY_OPTIONS } from '@/web/lib/query/secondaryQueryOptions';

const ACTIVE_UPDATE_PHASES = new Set(['checking', 'downloading', 'downloaded']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isActiveUpdatePhase(phase: string | undefined): boolean {
    return typeof phase === 'string' && ACTIVE_UPDATE_PHASES.has(phase);
}

function readQueryPhase(value: unknown): string | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    return typeof value['phase'] === 'string' ? value['phase'] : undefined;
}

export function getUpdatesStatusRefetchInterval(data: unknown): number | false {
    return isActiveUpdatePhase(readQueryPhase(data)) ? 300 : false;
}

export const UPDATES_STATUS_QUERY_OPTIONS = {
    ...SECONDARY_QUERY_OPTIONS,
    refetchIntervalInBackground: true,
} as const;
