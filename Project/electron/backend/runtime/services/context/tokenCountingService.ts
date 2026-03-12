import { resolveConnectionProfile } from '@/app/backend/providers/service/endpointProfiles';
import type {
    RuntimeProviderId,
    TokenCountEstimate,
    TokenCountEstimatePart,
    TokenCountMode,
} from '@/app/backend/runtime/contracts';
import {
    countEncodedTextWithTokenizer,
    type TokenizerEncodingName,
    type TokenizerRuntimeError,
} from '@/app/backend/runtime/services/context/tokenizerRuntime';
import { extractTextFromParts } from '@/app/backend/runtime/services/runExecution/contextParts';
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

function resolveEncodingName(modelId: string): TokenizerEncodingName {
    const normalizedModelId = modelId.includes('/') ? (modelId.split('/').at(-1) ?? modelId) : modelId;
    const normalizedLookup = normalizedModelId.toLowerCase();
    return (
        normalizedLookup.startsWith('gpt-3.5') ||
        normalizedLookup.startsWith('gpt-4') ||
        normalizedLookup.startsWith('text-embedding-3') ||
        normalizedLookup.startsWith('text-embedding-ada')
            ? 'cl100k_base'
            : DEFAULT_ENCODING
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildHeuristicEstimatedPart(message: RunContextMessage): TokenCountEstimatePart {
    const text = extractTextFromParts(message.parts);
    const estimatedTokens = Math.ceil(text.length / 4);

    return {
        role: message.role,
        textLength: text.length,
        tokenCount: estimatedTokens + MESSAGE_OVERHEAD_TOKENS,
        containsImages: message.parts.some((part) => part.type === 'image'),
    };
}

async function buildEstimatedPart(input: {
    modelId: string;
    message: RunContextMessage;
}): Promise<{
    part: TokenCountEstimatePart;
    tokenizerError?: TokenizerRuntimeError;
}> {
    const text = extractTextFromParts(input.message.parts);
    const tokenCountResult = await countEncodedTextWithTokenizer({
        encodingName: resolveEncodingName(input.modelId),
        text,
    });

    if (tokenCountResult.isErr()) {
        return {
            part: buildHeuristicEstimatedPart(input.message),
            tokenizerError: tokenCountResult.error,
        };
    }

    return {
        part: {
            role: input.message.role,
            textLength: text.length,
            tokenCount: tokenCountResult.value + MESSAGE_OVERHEAD_TOKENS,
            containsImages: input.message.parts.some((part) => part.type === 'image'),
        },
    };
}

async function buildEstimatedCount(input: {
    providerId: RuntimeProviderId;
    modelId: string;
    messages: RunContextMessage[];
}): Promise<TokenCountEstimate> {
    const estimatedParts = await Promise.all(
        input.messages.map((message) =>
            buildEstimatedPart({
                modelId: input.modelId,
                message,
            })
        )
    );
    const tokenizerError = estimatedParts.find((entry) => entry.tokenizerError)?.tokenizerError;

    if (tokenizerError) {
        appLog.warn({
            tag: 'context.token-count',
            message: 'Estimated token counting fell back to heuristic sizing because the tokenizer runtime was unavailable.',
            providerId: input.providerId,
            modelId: input.modelId,
            errorCode: tokenizerError.code,
            error: tokenizerError.message,
        });
    }

    const parts = estimatedParts.map((entry) => entry.part);
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
    if (!isRecord(payload)) {
        return null;
    }
    const record = payload;
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
        appLog.debug({
            tag: 'context.token-count',
            message: 'Z.AI token counting skipped because auth resolution failed.',
            providerId: 'zai',
            profileId: input.profileId,
            modelId: input.modelId,
        });
        return null;
    }

    const connectionProfileResult = await resolveConnectionProfile(input.profileId, 'zai');
    const optionProfileId = connectionProfileResult.isErr()
        ? 'coding_international'
        : connectionProfileResult.value.optionProfileId;
    const baseUrl = optionProfileId === 'general_international' ? ZAI_GENERAL_BASE_URL : ZAI_CODING_BASE_URL;
    const tokenizerUrl = buildEndpoint(baseUrl, '/tokenizer');
    const token = authResult.value.accessToken ?? authResult.value.apiKey;
    if (!token) {
        appLog.debug({
            tag: 'context.token-count',
            message: 'Z.AI token counting skipped because no token was available.',
            providerId: 'zai',
            profileId: input.profileId,
            modelId: input.modelId,
        });
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
                text: extractTextFromParts(input.message.parts),
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
        if (tokenCount === null) {
            appLog.warn({
                tag: 'context.token-count',
                message: 'Z.AI tokenizer response did not include a readable token count.',
                providerId: 'zai',
                modelId: input.modelId,
            });
        }
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
            textLength: extractTextFromParts(message.parts).length,
            tokenCount: tokenCounts[index] ?? 0,
            containsImages: message.parts.some((part) => part.type === 'image'),
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

            appLog.debug({
                tag: 'context.token-count',
                message: 'Falling back to estimated token counting after exact counting was unavailable.',
                providerId: input.providerId,
                modelId: input.modelId,
                hasProfileId: Boolean(input.profileId),
            });
        }

        return buildEstimatedCount(input);
    }
}

export const tokenCountingService = new TokenCountingService();
