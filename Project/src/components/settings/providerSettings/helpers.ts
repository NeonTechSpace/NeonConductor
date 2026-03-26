import { providerIds } from '@/shared/contracts';
import type { RuntimeProviderId } from '@/shared/contracts';

export function isProviderId(value: string | undefined): value is RuntimeProviderId {
    if (!value) {
        return false;
    }

    return providerIds.some((providerId) => providerId === value);
}

export function methodLabel(method: string): string {
    if (method === 'api_key') return 'API key';
    if (method === 'device_code') return 'Device code';
    if (method === 'oauth_device') return 'OAuth device';
    if (method === 'oauth_pkce') return 'OAuth PKCE';
    return method;
}

export function formatMetric(value: number | undefined, fallback = '-'): string {
    if (value === undefined || !Number.isFinite(value)) {
        return fallback;
    }

    return String(value);
}

export function formatInteger(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return '-';
    }

    return Math.round(value).toLocaleString();
}

export function formatPercent(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return '-';
    }

    return `${Math.round(value).toString()}%`;
}

export function formatWindowLabel(minutes: number | undefined): string {
    if (!minutes || !Number.isFinite(minutes)) {
        return 'Window';
    }

    if (minutes === 5 * 60) {
        return '5h window';
    }

    if (minutes === 7 * 24 * 60) {
        return 'Weekly window';
    }

    if (minutes % (24 * 60) === 0) {
        return `${String(minutes / (24 * 60))}d window`;
    }

    if (minutes % 60 === 0) {
        return `${String(minutes / 60)}h window`;
    }

    return `${String(minutes)}m window`;
}

export function formatResetCountdown(resetAtMs: number | undefined): string {
    if (resetAtMs === undefined || !Number.isFinite(resetAtMs)) {
        return '-';
    }

    const diff = Math.round((resetAtMs - Date.now()) / 1000);
    if (diff <= 0) {
        return 'now';
    }

    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    if (hours > 0) {
        return `in ${String(hours)}h ${String(minutes)}m`;
    }

    return `in ${String(minutes)}m`;
}

export function formatElapsedTimeFromTimestamp(timestampMs: number | undefined): string {
    if (timestampMs === undefined || !Number.isFinite(timestampMs)) {
        return '-';
    }

    const diffSeconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
    if (diffSeconds < 60) {
        return 'just now';
    }

    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    if (hours > 0) {
        return `${String(hours)}h ${String(minutes)}m ago`;
    }

    return `${String(minutes)}m ago`;
}

export function isTimestampStale(timestampMs: number | undefined, staleAfterMs = 10 * 60 * 1000): boolean {
    if (timestampMs === undefined || !Number.isFinite(timestampMs)) {
        return false;
    }

    return Date.now() - timestampMs >= staleAfterMs;
}

export function formatDateTime(value: string | undefined): string {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
        return value;
    }

    return date.toLocaleString();
}
