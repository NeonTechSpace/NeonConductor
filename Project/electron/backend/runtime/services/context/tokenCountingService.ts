import { encoding_for_model, get_encoding, type TiktokenModel } from 'tiktoken';

import { resolveEndpointProfile } from '@/app/backend/providers/service/endpointProfiles';
import type {
    RuntimeProviderId,
    TokenCountEstimate,
    TokenCountEstimatePart,
    TokenCountMode,
} from '@/app/backend/runtime/contracts';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';
import { appLog } from '@/app/main/logging';

interface ProviderTokenCounter {
    readonly mode: TokenCountMode;
    supports(input: { providerId: RuntimeProviderId; modelId: string }): boolean;
    countTokens(input: {
        profileId?: string;
        providerId: RuntimeProviderId;
        modelId: string;
        messages: RunContextMessage[];
    }): Promise<TokenCountEstimate | null>;
}

const providerTokenCounters = new Map<RuntimeProviderId, ProviderTokenCounter>();
const DEFAULT_ENCODING = 'o200k_base';
const MESSAGE_OVERHEAD_TOKENS = 8;
const TOTAL_OVERHEAD_TOKENS = 3;
const ZAI_CODING_BASE_URL = process.env['ZAI_CODING_BASE_URL']?.trim() || 'https://api.z.ai/api/coding/paas/v4';
const ZAI_GENERAL_BASE_URL = process.env['ZAI_GENERAL_BASE_URL']?.trim() || 'https://api.z.ai/api/paas/v4';

function resolveEncoding(modelId: string) {
    const normalizedModelId = modelId.includes('/') ? (modelId.split('/').at(-1) ?? modelId) : modelId;

    try {
        return encoding_for_model(normalizedModelId as TiktokenModel);
    } catch {
        return get_encoding(DEFAULT_ENCODING);
    }
}

function buildEstimatedPart(modelId: string, message: RunContextMessage): TokenCountEstimatePart {
    const encoding = resolveEncoding(modelId);
    try {
        const tokenCount = encoding.encode(message.text).length + MESSAGE_OVERHEAD_TOKENS;
        return {
            role: message.role,
            textLength: message.text.length,
            tokenCount,
        };
    } finally {
        encoding.free();
    }
}

function buildEstimatedCount(input: {
    providerId: RuntimeProviderId;
    modelId: string;
    messages: RunContextMessage[];
}): TokenCountEstimate {
    const parts = input.messages.map((message) => buildEstimatedPart(input.modelId, message));
    return {
        providerId: input.providerId,
        modelId: input.modelId,
        mode: 'estimated',
        totalTokens: parts.reduce((sum, part) => sum + part.tokenCount, TOTAL_OVERHEAD_TOKENS),
        parts,
    };
}

function buildEndpoint(baseUrl: string, path: string): string {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${normalizedBase}${path}`;
}

function readTokenCount(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const directCandidates = ['token_count', 'tokens', 'count', 'total_tokens'];
    for (const key of directCandidates) {
        const value = record[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
    }

    const data = record['data'];
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        const nested = readTokenCount(data);
        if (nested !== null) {
            return nested;
        }
    }

    const usage = record['usage'];
    if (usage && typeof usage === 'object' && !Array.isArray(usage)) {
        const nested = readTokenCount(usage);
        if (nested !== null) {
            return nested;
        }
    }

    return null;
}

async function countZaiMessageTokens(input: {
    profileId: string;
    modelId: string;
    message: RunContextMessage;
}): Promise<number | null> {
    const authResult = await resolveRunAuth({
        profileId: input.profileId,
        providerId: 'zai',
    });
    if (authResult.isErr()) {
        return null;
    }

    const endpointProfileResult = await resolveEndpointProfile(input.profileId, 'zai');
    const endpointProfile = endpointProfileResult.isErr() ? 'coding_international' : endpointProfileResult.value;
    const baseUrl = endpointProfile === 'general_international' ? ZAI_GENERAL_BASE_URL : ZAI_CODING_BASE_URL;
    const tokenizerUrl = buildEndpoint(baseUrl, '/tokenizer');
    const token = authResult.value.accessToken ?? authResult.value.apiKey;
    if (!token) {
        return null;
    }

    try {
        const response = await fetch(tokenizerUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: input.modelId.startsWith('zai/') ? input.modelId.slice(4) : input.modelId,
                text: input.message.text,
            }),
        });

        if (!response.ok) {
            appLog.warn({
                tag: 'context.token-count',
                message: 'Z.AI tokenizer request failed.',
                providerId: 'zai',
                modelId: input.modelId,
                status: response.status,
            });
            return null;
        }

        const payload = (await response.json()) as unknown;
        const tokenCount = readTokenCount(payload);
        return tokenCount === null ? null : tokenCount + MESSAGE_OVERHEAD_TOKENS;
    } catch (error) {
        appLog.warn({
            tag: 'context.token-count',
            message: 'Z.AI tokenizer request failed before a response was received.',
            providerId: 'zai',
            modelId: input.modelId,
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

const zaiExactCounter: ProviderTokenCounter = {
    mode: 'exact',
    supports(input) {
        return input.providerId === 'zai';
    },
    async countTokens(input) {
        if (!input.profileId) {
            return null;
        }

        const profileId = input.profileId;
        if (!profileId) {
            return null;
        }

        const tokenCounts = await Promise.all(
            input.messages.map((message) =>
                countZaiMessageTokens({
                    profileId,
                    modelId: input.modelId,
                    message,
                })
            )
        );

        if (tokenCounts.some((value) => value === null)) {
            return null;
        }

        const parts = input.messages.map<TokenCountEstimatePart>((message, index) => ({
            role: message.role,
            textLength: message.text.length,
            tokenCount: tokenCounts[index] ?? 0,
        }));

        return {
            providerId: input.providerId,
            modelId: input.modelId,
            mode: 'exact',
            totalTokens: parts.reduce((sum, part) => sum + part.tokenCount, TOTAL_OVERHEAD_TOKENS),
            parts,
        };
    },
};

class TokenCountingService {
    constructor() {
        this.registerProviderCounter('zai', zaiExactCounter);
    }

    registerProviderCounter(providerId: RuntimeProviderId, counter: ProviderTokenCounter): void {
        providerTokenCounters.set(providerId, counter);
    }

    getPreferredMode(input: { providerId: RuntimeProviderId; modelId: string }): TokenCountMode {
        const providerCounter = providerTokenCounters.get(input.providerId);
        if (providerCounter?.supports(input)) {
            return providerCounter.mode;
        }

        return 'estimated';
    }

    async estimate(input: {
        profileId?: string;
        providerId: RuntimeProviderId;
        modelId: string;
        messages: RunContextMessage[];
    }): Promise<TokenCountEstimate> {
        const providerCounter = providerTokenCounters.get(input.providerId);
        if (providerCounter?.supports(input)) {
            const exactEstimate = await providerCounter.countTokens(input);
            if (exactEstimate) {
                return exactEstimate;
            }
        }

        return buildEstimatedCount(input);
    }
}

export const tokenCountingService = new TokenCountingService();
