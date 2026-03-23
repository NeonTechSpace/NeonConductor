import { providerAuthStore } from '@/app/backend/persistence/stores';
import type {
    OpenAISubscriptionRateLimitEntry,
    OpenAISubscriptionRateLimitWindow,
    OpenAISubscriptionRateLimitsSummary,
} from '@/app/backend/persistence/types';
import { readProviderSecretValue } from '@/app/backend/providers/auth/providerSecrets';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import { appLog } from '@/app/main/logging';

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

function parsePayload(payload: unknown): ProviderServiceResult<ParsedRateLimitPayload> {
    if (!isRecord(payload)) {
        return errProviderService('invalid_payload', 'OpenAI WHAM usage payload is not an object.');
    }

    const limits: OpenAISubscriptionRateLimitEntry[] = [];

    const primaryLimits = parseRateLimitNode(payload['rate_limit']);
    if (primaryLimits.primary || primaryLimits.secondary) {
        limits.push({
            limitId: 'codex',
            ...primaryLimits,
        });
    }

    const additionalRateLimits = payload['additional_rate_limits'];
    if (Array.isArray(additionalRateLimits)) {
        for (let index = 0; index < additionalRateLimits.length; index += 1) {
            const item = additionalRateLimits[index] as unknown;
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
        return errProviderService(
            'invalid_payload',
            'OpenAI WHAM usage payload does not include usable rate limit windows.'
        );
    }

    const planType = readString(payload['plan_type']);

    return okProviderService({
        ...(planType ? { planType } : {}),
        limits,
    });
}

function selectPreferredLimit(
    limits: OpenAISubscriptionRateLimitEntry[]
): OpenAISubscriptionRateLimitEntry | undefined {
    return limits.find((limit) => limit.limitId === 'codex') ?? limits[0];
}

function unavailable(input: {
    profileId: string;
    fetchedAt: number;
    reason: OpenAISubscriptionRateLimitsSummary['reason'];
    detail?: string;
}): OpenAISubscriptionRateLimitsSummary {
    const summary: OpenAISubscriptionRateLimitsSummary = {
        providerId: 'openai_codex',
        source: 'unavailable',
        fetchedAt: input.fetchedAt,
        limits: [],
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.detail ? { detail: input.detail } : {}),
    };

    appLog.warn({
        tag: 'provider.openai-subscription-rate-limits',
        message: 'OpenAI subscription rate limits unavailable.',
        profileId: input.profileId,
        reason: input.reason ?? null,
        detail: input.detail ?? null,
    });

    return summary;
}

export async function getOpenAISubscriptionRateLimits(profileId: string): Promise<OpenAISubscriptionRateLimitsSummary> {
    const fetchedAt = Date.now();
    appLog.info({
        tag: 'provider.openai-subscription-rate-limits',
        message: 'Fetching OpenAI subscription rate limits from WHAM usage endpoint.',
        profileId,
    });
    const authState = await providerAuthStore.getByProfileAndProvider(profileId, 'openai_codex');
    if (!authState || authState.authMethod === 'none' || authState.authMethod === 'api_key') {
        return unavailable({
            profileId,
            fetchedAt,
            reason: 'oauth_required',
            detail: 'OpenAI Codex subscription limits are available only with OAuth-authenticated OpenAI Codex sessions.',
        });
    }

    if (authState.authState !== 'authenticated') {
        return unavailable({
            profileId,
            fetchedAt,
            reason: 'not_authenticated',
            detail: `OpenAI auth state "${authState.authState}" is not authenticated.`,
        });
    }

    const accessToken = await readProviderSecretValue(profileId, 'openai_codex', 'access_token');
    if (!accessToken) {
        return unavailable({
            profileId,
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
            profileId,
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
            profileId,
            fetchedAt,
            reason: 'fetch_failed',
            detail,
        });
    }

    try {
        const payload = (await response.json()) as unknown;
        const parsed = parsePayload(payload);
        if (parsed.isErr()) {
            return unavailable({
                profileId,
                fetchedAt,
                reason: 'invalid_payload',
                detail: parsed.error.message,
            });
        }
        const preferred = selectPreferredLimit(parsed.value.limits);

        appLog.info({
            tag: 'provider.openai-subscription-rate-limits',
            message: 'Fetched OpenAI subscription rate limits from WHAM usage endpoint.',
            profileId,
            limitsCount: parsed.value.limits.length,
            hasPrimary: Boolean(preferred?.primary),
            hasSecondary: Boolean(preferred?.secondary),
            ...(parsed.value.planType ? { planType: parsed.value.planType } : {}),
        });

        return {
            providerId: 'openai_codex',
            source: 'chatgpt_wham',
            fetchedAt,
            ...(parsed.value.planType ? { planType: parsed.value.planType } : {}),
            ...(preferred?.primary ? { primary: preferred.primary } : {}),
            ...(preferred?.secondary ? { secondary: preferred.secondary } : {}),
            limits: parsed.value.limits,
        };
    } catch (error) {
        return unavailable({
            profileId,
            fetchedAt,
            reason: 'invalid_payload',
            detail: error instanceof Error ? error.message : String(error),
        });
    }
}
