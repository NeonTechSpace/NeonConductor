import { providerAuthStore } from '@/app/backend/persistence/stores';
import type {
    OpenAISubscriptionRateLimitEntry,
    OpenAISubscriptionRateLimitWindow,
    OpenAISubscriptionRateLimitsSummary,
} from '@/app/backend/persistence/types';
import { readSecretValue } from '@/app/backend/providers/auth/secretRefs';

const OPENAI_CHATGPT_WHAM_USAGE_ENDPOINT =
    process.env['OPENAI_CHATGPT_WHAM_USAGE_ENDPOINT']?.trim() || 'https://chatgpt.com/backend-api/wham/usage';

interface ParsedRateLimitPayload {
    planType?: string;
    limits: OpenAISubscriptionRateLimitEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return undefined;
}

function clampPercent(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(100, value));
}

function normalizeResetTimestamp(value: number): number {
    if (value > 1_000_000_000_000) {
        return Math.round(value);
    }

    return Math.round(value * 1000);
}

function parseWindow(input: unknown): OpenAISubscriptionRateLimitWindow | undefined {
    if (!isRecord(input)) {
        return undefined;
    }

    const usedPercent = readNumber(input['used_percent']);
    if (usedPercent === undefined) {
        return undefined;
    }

    const windowMinutesRaw = readNumber(input['limit_window_seconds']);
    const resetAtRaw = readNumber(input['reset_at']);

    return {
        usedPercent: clampPercent(usedPercent),
        ...(windowMinutesRaw !== undefined ? { windowMinutes: Math.max(1, Math.round(windowMinutesRaw / 60)) } : {}),
        ...(resetAtRaw !== undefined ? { resetsAt: normalizeResetTimestamp(resetAtRaw) } : {}),
    };
}

function parseRateLimitNode(input: unknown): {
    primary?: OpenAISubscriptionRateLimitWindow;
    secondary?: OpenAISubscriptionRateLimitWindow;
} {
    if (!isRecord(input)) {
        return {};
    }

    const primary = parseWindow(input['primary_window']);
    const secondary = parseWindow(input['secondary_window']);

    return {
        ...(primary ? { primary } : {}),
        ...(secondary ? { secondary } : {}),
    };
}

function parsePayload(payload: unknown): ParsedRateLimitPayload {
    if (!isRecord(payload)) {
        throw new Error('OpenAI WHAM usage payload is not an object.');
    }

    const limits: OpenAISubscriptionRateLimitEntry[] = [];

    const primaryLimits = parseRateLimitNode(payload['rate_limit']);
    if (primaryLimits.primary || primaryLimits.secondary) {
        limits.push({
            limitId: 'codex',
            ...primaryLimits,
        });
    }

    const additional = payload['additional_rate_limits'];
    if (Array.isArray(additional)) {
        for (let index = 0; index < additional.length; index += 1) {
            const item = additional[index];
            if (!isRecord(item)) {
                continue;
            }

            const parsed = parseRateLimitNode(item['rate_limit']);
            if (!parsed.primary && !parsed.secondary) {
                continue;
            }

            const meteredFeature = readString(item['metered_feature']);
            const limitName = readString(item['limit_name']);
            limits.push({
                limitId: meteredFeature ?? limitName ?? `limit_${String(index + 1)}`,
                ...(limitName ? { limitName } : {}),
                ...parsed,
            });
        }
    }

    if (limits.length === 0) {
        throw new Error('OpenAI WHAM usage payload does not include usable rate limit windows.');
    }

    const planType = readString(payload['plan_type']);

    return {
        ...(planType ? { planType } : {}),
        limits,
    };
}

function selectPreferredLimit(
    limits: OpenAISubscriptionRateLimitEntry[]
): OpenAISubscriptionRateLimitEntry | undefined {
    return limits.find((limit) => limit.limitId === 'codex') ?? limits[0];
}

function unavailable(input: {
    fetchedAt: number;
    reason: OpenAISubscriptionRateLimitsSummary['reason'];
    detail?: string;
}): OpenAISubscriptionRateLimitsSummary {
    return {
        providerId: 'openai',
        source: 'unavailable',
        fetchedAt: input.fetchedAt,
        limits: [],
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.detail ? { detail: input.detail } : {}),
    };
}

export async function getOpenAISubscriptionRateLimits(profileId: string): Promise<OpenAISubscriptionRateLimitsSummary> {
    const fetchedAt = Date.now();
    const authState = await providerAuthStore.getByProfileAndProvider(profileId, 'openai');
    if (!authState || authState.authMethod === 'none' || authState.authMethod === 'api_key') {
        return unavailable({
            fetchedAt,
            reason: 'oauth_required',
            detail: 'OpenAI subscription limits are available only with OAuth-authenticated OpenAI sessions.',
        });
    }

    if (authState.authState !== 'authenticated') {
        return unavailable({
            fetchedAt,
            reason: 'not_authenticated',
            detail: `OpenAI auth state "${authState.authState}" is not authenticated.`,
        });
    }

    const accessToken = await readSecretValue(profileId, 'openai', 'access_token');
    if (!accessToken) {
        return unavailable({
            fetchedAt,
            reason: 'missing_access_token',
            detail: 'OpenAI OAuth access token is missing from secret storage.',
        });
    }

    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
    };
    if (authState.accountId) {
        headers['ChatGPT-Account-Id'] = authState.accountId;
    }

    let response: Response;
    try {
        response = await fetch(OPENAI_CHATGPT_WHAM_USAGE_ENDPOINT, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(15_000),
        });
    } catch (error) {
        return unavailable({
            fetchedAt,
            reason: 'fetch_failed',
            detail: error instanceof Error ? error.message : String(error),
        });
    }

    if (!response.ok) {
        let detail = `OpenAI WHAM usage request failed (${String(response.status)} ${response.statusText}).`;
        try {
            const body = await response.text();
            if (body.trim().length > 0) {
                detail = `${detail} ${body.slice(0, 256)}`;
            }
        } catch {
            // ignore read-body failures
        }

        return unavailable({
            fetchedAt,
            reason: 'fetch_failed',
            detail,
        });
    }

    try {
        const payload = (await response.json()) as unknown;
        const parsed = parsePayload(payload);
        const preferred = selectPreferredLimit(parsed.limits);
        return {
            providerId: 'openai',
            source: 'chatgpt_wham',
            fetchedAt,
            ...(parsed.planType ? { planType: parsed.planType } : {}),
            ...(preferred?.primary ? { primary: preferred.primary } : {}),
            ...(preferred?.secondary ? { secondary: preferred.secondary } : {}),
            limits: parsed.limits,
        };
    } catch (error) {
        return unavailable({
            fetchedAt,
            reason: 'invalid_payload',
            detail: error instanceof Error ? error.message : String(error),
        });
    }
}
