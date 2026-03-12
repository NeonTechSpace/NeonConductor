const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function trimOptional(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function deriveBaseUrlFromEndpoint(endpoint: string | undefined, suffix: string): string | null {
    const normalizedEndpoint = trimOptional(endpoint);
    if (!normalizedEndpoint || !normalizedEndpoint.endsWith(suffix)) {
        return null;
    }

    return normalizeBaseUrl(normalizedEndpoint.slice(0, -suffix.length));
}

export function resolveOpenAIBaseUrl(): string {
    const explicitBaseUrl = trimOptional(process.env['OPENAI_BASE_URL']);
    if (explicitBaseUrl) {
        return normalizeBaseUrl(explicitBaseUrl);
    }

    const chatDerivedBaseUrl = deriveBaseUrlFromEndpoint(
        process.env['OPENAI_CHAT_COMPLETIONS_ENDPOINT'],
        '/chat/completions'
    );
    const responsesDerivedBaseUrl = deriveBaseUrlFromEndpoint(process.env['OPENAI_RESPONSES_ENDPOINT'], '/responses');

    if (chatDerivedBaseUrl && responsesDerivedBaseUrl && chatDerivedBaseUrl === responsesDerivedBaseUrl) {
        return chatDerivedBaseUrl;
    }

    if (chatDerivedBaseUrl && !responsesDerivedBaseUrl) {
        return chatDerivedBaseUrl;
    }

    if (responsesDerivedBaseUrl && !chatDerivedBaseUrl) {
        return responsesDerivedBaseUrl;
    }

    return DEFAULT_OPENAI_BASE_URL;
}

export function resolveOpenAIEndpoints(): {
    chatCompletionsUrl: string;
    responsesUrl: string;
    baseUrl: string;
} {
    const baseUrl = resolveOpenAIBaseUrl();

    return {
        chatCompletionsUrl:
            trimOptional(process.env['OPENAI_CHAT_COMPLETIONS_ENDPOINT']) ?? `${baseUrl}/chat/completions`,
        responsesUrl: trimOptional(process.env['OPENAI_RESPONSES_ENDPOINT']) ?? `${baseUrl}/responses`,
        baseUrl,
    };
}
