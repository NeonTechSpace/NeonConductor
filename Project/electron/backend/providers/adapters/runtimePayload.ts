import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';

export interface RuntimeParsedPart {
    partType: 'text' | 'reasoning' | 'reasoning_summary' | 'reasoning_encrypted' | 'tool_call';
    payload: Record<string, unknown>;
}

export interface RuntimeParsedCompletion {
    parts: RuntimeParsedPart[];
    usage: {
        inputTokens?: number;
        outputTokens?: number;
        cachedTokens?: number;
        reasoningTokens?: number;
        totalTokens?: number;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
}

function normalizeUsage(value: unknown): RuntimeParsedCompletion['usage'] {
    if (!isRecord(value)) {
        return {};
    }

    const usage: RuntimeParsedCompletion['usage'] = {};
    const promptTokens = readOptionalNumber(value['prompt_tokens']);
    const completionTokens = readOptionalNumber(value['completion_tokens']);
    const inputTokens = readOptionalNumber(value['input_tokens']);
    const outputTokens = readOptionalNumber(value['output_tokens']);
    const totalTokens = readOptionalNumber(value['total_tokens']);

    const inputDetails = isRecord(value['input_tokens_details']) ? value['input_tokens_details'] : null;
    const outputDetails = isRecord(value['output_tokens_details']) ? value['output_tokens_details'] : null;
    const cachedTokens = readOptionalNumber(inputDetails?.['cached_tokens']);
    const reasoningTokens = readOptionalNumber(outputDetails?.['reasoning_tokens']);
    const usageCachedTokens = readOptionalNumber(value['cached_tokens']);
    const usageReasoningTokens = readOptionalNumber(value['reasoning_tokens']);

    if (promptTokens !== undefined) usage.inputTokens = promptTokens;
    if (completionTokens !== undefined) usage.outputTokens = completionTokens;
    if (inputTokens !== undefined) usage.inputTokens = inputTokens;
    if (outputTokens !== undefined) usage.outputTokens = outputTokens;
    if (totalTokens !== undefined) usage.totalTokens = totalTokens;
    if (cachedTokens !== undefined) usage.cachedTokens = cachedTokens;
    if (usageCachedTokens !== undefined) usage.cachedTokens = usageCachedTokens;
    if (reasoningTokens !== undefined) usage.reasoningTokens = reasoningTokens;
    if (usageReasoningTokens !== undefined) usage.reasoningTokens = usageReasoningTokens;

    return usage;
}

function parseOpaqueReasoningParts(reasoningSource: Record<string, unknown>): RuntimeParsedPart[] {
    const parts: RuntimeParsedPart[] = [];
    const encrypted =
        reasoningSource['encrypted_content'] ?? reasoningSource['encrypted'] ?? reasoningSource['encryptedContent'];
    if (encrypted !== undefined && encrypted !== null) {
        parts.push({
            partType: 'reasoning_encrypted',
            payload: {
                opaque: encrypted,
            },
        });
    }

    return parts;
}

function parseReasoningSummaryParts(reasoningSource: Record<string, unknown>): RuntimeParsedPart[] {
    const parts: RuntimeParsedPart[] = [];
    const summaryField = reasoningSource['summary'];
    const summaries = Array.isArray(summaryField) ? summaryField : [summaryField];
    for (const summary of summaries) {
        if (typeof summary === 'string') {
            const text = readOptionalString(summary);
            if (text) {
                parts.push({
                    partType: 'reasoning_summary',
                    payload: {
                        text,
                    },
                });
            }
            continue;
        }

        if (!isRecord(summary)) {
            continue;
        }

        const text =
            readOptionalString(summary['text']) ??
            readOptionalString(summary['summary']) ??
            readOptionalString(summary['value']);
        if (text) {
            parts.push({
                partType: 'reasoning_summary',
                payload: {
                    text,
                },
            });
        }
    }

    return parts;
}

function parseReasoningTextParts(reasoningSource: Record<string, unknown>): RuntimeParsedPart[] {
    const parts: RuntimeParsedPart[] = [];
    const text = readOptionalString(reasoningSource['text']) ?? readOptionalString(reasoningSource['content']);
    if (text) {
        parts.push({
            partType: 'reasoning',
            payload: {
                text,
            },
        });
    }

    return parts;
}

export function parseStructuredToolCall(input: {
    callId: unknown;
    toolName: unknown;
    argumentsText: unknown;
    sourceLabel: string;
}): ProviderAdapterResult<RuntimeParsedPart> {
    const callId = readOptionalString(input.callId);
    if (!callId) {
        return errProviderAdapter('invalid_payload', `${input.sourceLabel} tool call is missing a call id.`);
    }

    const toolName = readOptionalString(input.toolName);
    if (!toolName) {
        return errProviderAdapter('invalid_payload', `${input.sourceLabel} tool call is missing a function name.`);
    }

    const argumentsText = typeof input.argumentsText === 'string' ? input.argumentsText : undefined;
    if (argumentsText === undefined) {
        return errProviderAdapter(
            'invalid_payload',
            `${input.sourceLabel} tool call "${toolName}" is missing serialized arguments.`
        );
    }

    let parsedArguments: unknown;
    try {
        parsedArguments = JSON.parse(argumentsText);
    } catch {
        return errProviderAdapter(
            'invalid_payload',
            `${input.sourceLabel} tool call "${toolName}" contained invalid JSON arguments.`
        );
    }

    if (!isRecord(parsedArguments)) {
        return errProviderAdapter(
            'invalid_payload',
            `${input.sourceLabel} tool call "${toolName}" must contain a JSON object for arguments.`
        );
    }

    return okProviderAdapter({
        partType: 'tool_call',
        payload: {
            callId,
            toolName,
            argumentsText,
            args: parsedArguments,
        },
    });
}

function parseMessageContentAsParts(content: unknown): RuntimeParsedPart[] {
    if (typeof content === 'string') {
        const text = readOptionalString(content);
        return text
            ? [
                  {
                      partType: 'text',
                      payload: { text },
                  },
              ]
            : [];
    }

    if (!Array.isArray(content)) {
        return [];
    }

    const parts: RuntimeParsedPart[] = [];
    for (const entry of content) {
        if (!isRecord(entry)) {
            continue;
        }

        const type = readOptionalString(entry['type']);
        if (type === 'reasoning') {
            parts.push(...parseReasoningTextParts(entry));
            parts.push(...parseReasoningSummaryParts(entry));
            parts.push(...parseOpaqueReasoningParts(entry));
            continue;
        }

        const directText = readOptionalString(entry['text']);
        if (directText) {
            parts.push({
                partType: 'text',
                payload: { text: directText },
            });
            continue;
        }

        const nestedText = isRecord(entry['text']) ? readOptionalString(entry['text']['value']) : undefined;
        if (nestedText) {
            parts.push({
                partType: 'text',
                payload: { text: nestedText },
            });
        }
    }

    return parts;
}

export function parseChatCompletionsPayload(payload: unknown): ProviderAdapterResult<RuntimeParsedCompletion> {
    if (!isRecord(payload)) {
        return errProviderAdapter('invalid_payload', 'Invalid chat completion payload.');
    }

    const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
    const firstChoice = choices.find((item) => isRecord(item));
    const message = firstChoice && isRecord(firstChoice['message']) ? firstChoice['message'] : null;
    const parts: RuntimeParsedPart[] = [];

    if (message) {
        parts.push(...parseMessageContentAsParts(message['content']));
        const rawToolCalls = Array.isArray(message['tool_calls']) ? message['tool_calls'] : [];
        for (const rawToolCall of rawToolCalls) {
            if (!isRecord(rawToolCall)) {
                continue;
            }

            const functionRecord = readOptionalRecord(rawToolCall['function']);
            const toolCallResult = parseStructuredToolCall({
                callId: rawToolCall['id'],
                toolName: functionRecord?.['name'],
                argumentsText: functionRecord?.['arguments'],
                sourceLabel: 'Chat completions payload',
            });
            if (toolCallResult.isErr()) {
                return errProviderAdapter(toolCallResult.error.code, toolCallResult.error.message);
            }
            parts.push(toolCallResult.value);
        }

        const reasoning = message['reasoning'];
        if (typeof reasoning === 'string') {
            const text = readOptionalString(reasoning);
            if (text) {
                parts.push({
                    partType: 'reasoning',
                    payload: {
                        text,
                    },
                });
            }
        } else if (isRecord(reasoning)) {
            parts.push(...parseReasoningTextParts(reasoning));
            parts.push(...parseReasoningSummaryParts(reasoning));
            parts.push(...parseOpaqueReasoningParts(reasoning));
        }
    }

    return okProviderAdapter({
        parts,
        usage: normalizeUsage(payload['usage']),
    });
}

export function parseResponsesPayload(payload: unknown): ProviderAdapterResult<RuntimeParsedCompletion> {
    if (!isRecord(payload)) {
        return errProviderAdapter('invalid_payload', 'Invalid responses payload.');
    }

    const parts: RuntimeParsedPart[] = [];
    const output = Array.isArray(payload['output']) ? payload['output'] : [];

    for (const item of output) {
        if (!isRecord(item)) {
            continue;
        }

        const type = readOptionalString(item['type']);

        if (type === 'reasoning') {
            parts.push(...parseReasoningTextParts(item));
            parts.push(...parseReasoningSummaryParts(item));
            parts.push(...parseOpaqueReasoningParts(item));
            continue;
        }

        if (type === 'function_call') {
            const toolCallResult = parseStructuredToolCall({
                callId: item['call_id'] ?? item['id'],
                toolName: item['name'],
                argumentsText: item['arguments'],
                sourceLabel: 'Responses payload',
            });
            if (toolCallResult.isErr()) {
                return errProviderAdapter(toolCallResult.error.code, toolCallResult.error.message);
            }
            parts.push(toolCallResult.value);
            continue;
        }

        if (type === 'message') {
            const content = Array.isArray(item['content']) ? item['content'] : [];
            for (const entry of content) {
                if (!isRecord(entry)) {
                    continue;
                }

                const entryType = readOptionalString(entry['type']);
                if (entryType === 'output_text' || entryType === 'text') {
                    const text = readOptionalString(entry['text']);
                    if (text) {
                        parts.push({
                            partType: 'text',
                            payload: { text },
                        });
                    }
                    continue;
                }

                if (entryType === 'reasoning') {
                    parts.push(...parseReasoningTextParts(entry));
                    parts.push(...parseReasoningSummaryParts(entry));
                    parts.push(...parseOpaqueReasoningParts(entry));
                }
            }
            continue;
        }

        if (type === 'output_text') {
            const text = readOptionalString(item['text']);
            if (text) {
                parts.push({
                    partType: 'text',
                    payload: { text },
                });
            }
        }
    }

    return okProviderAdapter({
        parts,
        usage: normalizeUsage(payload['usage']),
    });
}
