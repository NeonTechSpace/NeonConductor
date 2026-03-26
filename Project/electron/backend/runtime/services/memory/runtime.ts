import { memoryStore, messageStore, runStore, runUsageStore, threadStore } from '@/app/backend/persistence/stores';
import type { MessagePartRecord, MessageRecord, RunUsageRecord } from '@/app/backend/persistence/types';
import type { MemoryRecord, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { memoryService } from '@/app/backend/runtime/services/memory/service';
import { appLog } from '@/app/main/logging';

type FinishedRunStatus = 'completed' | 'error';
type AutomaticRunMemoryAction = 'created' | 'superseded' | 'noop' | 'skipped';

interface RuntimeRunOutcomeMemoryMetadata extends Record<string, unknown> {
    source: 'runtime_run_outcome';
    extractionVersion: 1;
    runId: string;
    sessionId: string;
    threadId?: string;
    runStatus: FinishedRunStatus;
    providerId: RuntimeProviderId;
    modelId: string;
    hasAssistantText: boolean;
    toolCallCount: number;
    toolErrorCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readTextPayload(part: MessagePartRecord): string | undefined {
    const text = part.payload['text'];
    return typeof text === 'string' && text.trim().length > 0 ? text.trim() : undefined;
}

function readToolName(part: MessagePartRecord): string | undefined {
    const toolName = part.payload['toolName'];
    return typeof toolName === 'string' && toolName.trim().length > 0 ? toolName.trim() : undefined;
}

function readToolError(part: MessagePartRecord): boolean {
    return part.payload['isError'] === true;
}

function isAutomaticRunOutcomeMemory(memory: MemoryRecord): boolean {
    if (memory.createdByKind !== 'system') {
        return false;
    }
    if (memory.memoryType !== 'episodic' || memory.scopeKind !== 'run' || !memory.runId) {
        return false;
    }
    if (!isRecord(memory.metadata)) {
        return false;
    }

    return memory.metadata['source'] === 'runtime_run_outcome';
}

function buildMessagePartsByMessageId(parts: MessagePartRecord[]): Map<string, MessagePartRecord[]> {
    const partsByMessageId = new Map<string, MessagePartRecord[]>();
    for (const part of parts) {
        const existing = partsByMessageId.get(part.messageId) ?? [];
        existing.push(part);
        partsByMessageId.set(part.messageId, existing);
    }

    return partsByMessageId;
}

function collectAssistantText(
    messages: MessageRecord[],
    partsByMessageId: Map<string, MessagePartRecord[]>
): string | undefined {
    const assistantMessages = messages.filter((message) => message.role === 'assistant');
    for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
        const assistantMessage = assistantMessages[index];
        if (!assistantMessage) {
            continue;
        }

        const parts = partsByMessageId.get(assistantMessage.id) ?? [];
        const textSegments = parts
            .filter((part) => part.partType === 'text' || part.partType === 'reasoning_summary')
            .map(readTextPayload)
            .filter((value): value is string => typeof value === 'string' && value.length > 0);
        if (textSegments.length > 0) {
            return textSegments.join('\n\n').trim();
        }
    }

    return undefined;
}

function summarizeToolResults(parts: MessagePartRecord[]): {
    toolCallCount: number;
    toolErrorCount: number;
    toolNames: string[];
} {
    const toolResults = parts.filter((part) => part.partType === 'tool_result');
    const toolNames = Array.from(
        new Set(
            toolResults
                .map(readToolName)
                .filter((value): value is string => typeof value === 'string' && value.length > 0)
        )
    ).sort((left, right) => left.localeCompare(right));

    return {
        toolCallCount: toolResults.length,
        toolErrorCount: toolResults.filter(readToolError).length,
        toolNames,
    };
}

function formatPromptSnippet(prompt: string): string {
    const normalized = prompt.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 72) {
        return normalized;
    }

    return `${normalized.slice(0, 69)}...`;
}

function formatUsageSummary(usage: RunUsageRecord | null): string | undefined {
    if (!usage) {
        return undefined;
    }

    const segments: string[] = [];
    if (usage.totalTokens !== undefined) {
        segments.push(`total ${String(usage.totalTokens)} tokens`);
    }
    if (usage.inputTokens !== undefined) {
        segments.push(`input ${String(usage.inputTokens)}`);
    }
    if (usage.outputTokens !== undefined) {
        segments.push(`output ${String(usage.outputTokens)}`);
    }
    if (usage.cachedTokens !== undefined && usage.cachedTokens > 0) {
        segments.push(`cached ${String(usage.cachedTokens)}`);
    }
    if (usage.reasoningTokens !== undefined && usage.reasoningTokens > 0) {
        segments.push(`reasoning ${String(usage.reasoningTokens)}`);
    }
    if (usage.latencyMs !== undefined) {
        segments.push(`latency ${String(usage.latencyMs)} ms`);
    }

    return segments.length > 0 ? segments.join(', ') : undefined;
}

function buildMemoryTitle(input: { prompt: string; runStatus: FinishedRunStatus }): string {
    const statusLabel = input.runStatus === 'completed' ? 'Completed' : 'Failed';
    const promptSnippet = formatPromptSnippet(input.prompt);
    return promptSnippet.length > 0 ? `${statusLabel} run: ${promptSnippet}` : `${statusLabel} run`;
}

function buildMemorySummary(input: {
    prompt: string;
    runStatus: FinishedRunStatus;
    providerId: RuntimeProviderId;
    modelId: string;
}): string {
    const statusLabel = input.runStatus === 'completed' ? 'Completed' : 'Failed';
    const promptSnippet = formatPromptSnippet(input.prompt);
    return `${statusLabel} run on ${input.providerId}/${input.modelId}${promptSnippet.length > 0 ? ` for "${promptSnippet}"` : ''}.`;
}

function buildMemoryBody(input: {
    prompt: string;
    runStatus: FinishedRunStatus;
    providerId: RuntimeProviderId;
    modelId: string;
    runId: string;
    sessionId: string;
    threadId?: string;
    assistantText?: string;
    toolSummary: {
        toolCallCount: number;
        toolErrorCount: number;
        toolNames: string[];
    };
    usageSummary?: string;
    errorMessage?: string;
}): string {
    const lines: string[] = [
        '# Run outcome',
        '',
        `- Status: ${input.runStatus === 'completed' ? 'completed' : 'failed'}`,
        `- Provider/model: ${input.providerId}/${input.modelId}`,
        `- Run id: ${input.runId}`,
        `- Session id: ${input.sessionId}`,
        ...(input.threadId ? [`- Thread id: ${input.threadId}`] : []),
        '',
        '## Prompt',
        '',
        input.prompt.trim().length > 0 ? input.prompt.trim() : '_No prompt text recorded._',
    ];

    if (input.assistantText) {
        lines.push('', '## Assistant output', '', input.assistantText);
    }

    if (input.toolSummary.toolCallCount > 0) {
        lines.push(
            '',
            '## Tool summary',
            '',
            `- Tool calls: ${String(input.toolSummary.toolCallCount)}`,
            `- Tool errors: ${String(input.toolSummary.toolErrorCount)}`,
            ...(input.toolSummary.toolNames.length > 0
                ? [`- Tools used: ${input.toolSummary.toolNames.join(', ')}`]
                : [])
        );
    }

    if (input.usageSummary) {
        lines.push('', '## Usage', '', input.usageSummary);
    }

    if (input.errorMessage && input.errorMessage.trim().length > 0) {
        lines.push('', '## Failure detail', '', input.errorMessage.trim());
    }

    return lines.join('\n').trim();
}

function buildRuntimeMemoryMetadata(input: {
    runId: string;
    sessionId: string;
    threadId?: string;
    runStatus: FinishedRunStatus;
    providerId: RuntimeProviderId;
    modelId: string;
    hasAssistantText: boolean;
    toolCallCount: number;
    toolErrorCount: number;
}): RuntimeRunOutcomeMemoryMetadata {
    return {
        source: 'runtime_run_outcome',
        extractionVersion: 1,
        runId: input.runId,
        sessionId: input.sessionId,
        ...(input.threadId ? { threadId: input.threadId } : {}),
        runStatus: input.runStatus,
        providerId: input.providerId,
        modelId: input.modelId,
        hasAssistantText: input.hasAssistantText,
        toolCallCount: input.toolCallCount,
        toolErrorCount: input.toolErrorCount,
    };
}

function areMetadataEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export class MemoryRuntimeService {
    async captureFinishedRunMemory(input: { profileId: string; runId: string }): Promise<
        OperationalResult<{
            action: AutomaticRunMemoryAction;
            memory?: MemoryRecord;
            previousMemory?: MemoryRecord;
        }>
    > {
        const run = await runStore.getById(input.runId);
        if (!run || run.profileId !== input.profileId) {
            return errOp('not_found', `Run "${input.runId}" was not found.`);
        }
        if (run.status !== 'completed' && run.status !== 'error') {
            return okOp({
                action: 'skipped',
            });
        }
        if (!run.providerId || !run.modelId) {
            return errOp('invalid_input', `Run "${input.runId}" is missing provider or model metadata.`);
        }

        const [sessionThread, usage, messages, parts, runScopedMemories] = await Promise.all([
            threadStore.getBySessionId(input.profileId, run.sessionId),
            runUsageStore.getByRunId(run.id),
            messageStore.listMessagesBySession(input.profileId, run.sessionId, run.id),
            messageStore.listPartsBySession(input.profileId, run.sessionId, run.id),
            memoryStore.listByProfile({
                profileId: input.profileId,
                memoryType: 'episodic',
                scopeKind: 'run',
                runId: run.id,
            }),
        ]);

        const automaticRunMemories = runScopedMemories.filter((memory) => isAutomaticRunOutcomeMemory(memory));
        const activeAutomaticMemory = automaticRunMemories.find((memory) => memory.state === 'active');
        const partsByMessageId = buildMessagePartsByMessageId(parts);
        const assistantText = collectAssistantText(messages, partsByMessageId);
        const toolSummary = summarizeToolResults(parts);
        const usageSummary = formatUsageSummary(usage);
        const metadata = buildRuntimeMemoryMetadata({
            runId: run.id,
            sessionId: run.sessionId,
            ...(sessionThread ? { threadId: sessionThread.thread.id } : {}),
            runStatus: run.status,
            providerId: run.providerId,
            modelId: run.modelId,
            hasAssistantText: typeof assistantText === 'string' && assistantText.length > 0,
            toolCallCount: toolSummary.toolCallCount,
            toolErrorCount: toolSummary.toolErrorCount,
        });
        const title = buildMemoryTitle({
            prompt: run.prompt,
            runStatus: run.status,
        });
        const summaryText = buildMemorySummary({
            prompt: run.prompt,
            runStatus: run.status,
            providerId: run.providerId,
            modelId: run.modelId,
        });
        const bodyMarkdown = buildMemoryBody({
            prompt: run.prompt,
            runStatus: run.status,
            providerId: run.providerId,
            modelId: run.modelId,
            runId: run.id,
            sessionId: run.sessionId,
            ...(sessionThread ? { threadId: sessionThread.thread.id } : {}),
            ...(assistantText ? { assistantText } : {}),
            toolSummary,
            ...(usageSummary ? { usageSummary } : {}),
            ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
        });

        if (
            activeAutomaticMemory &&
            activeAutomaticMemory.title === title &&
            activeAutomaticMemory.bodyMarkdown === bodyMarkdown &&
            activeAutomaticMemory.summaryText === summaryText &&
            areMetadataEqual(activeAutomaticMemory.metadata, metadata)
        ) {
            return okOp({
                action: 'noop',
                memory: activeAutomaticMemory,
            });
        }

        if (activeAutomaticMemory) {
            const superseded = await memoryService.supersedeMemory({
                profileId: input.profileId,
                memoryId: activeAutomaticMemory.id,
                createdByKind: 'system',
                title,
                bodyMarkdown,
                summaryText,
                metadata,
            });
            if (superseded.isErr()) {
                return errOp(superseded.error.code, superseded.error.message, {
                    ...(superseded.error.details ? { details: superseded.error.details } : {}),
                });
            }

            return okOp({
                action: 'superseded',
                memory: superseded.value.replacement,
                previousMemory: superseded.value.previous,
            });
        }

        const created = await memoryService.createMemory({
            profileId: input.profileId,
            memoryType: 'episodic',
            scopeKind: 'run',
            createdByKind: 'system',
            runId: run.id,
            title,
            bodyMarkdown,
            summaryText,
            metadata,
        });
        if (created.isErr()) {
            return errOp(created.error.code, created.error.message, {
                ...(created.error.details ? { details: created.error.details } : {}),
            });
        }

        return okOp({
            action: 'created',
            memory: created.value,
        });
    }

    async captureFinishedRunMemorySafely(input: { profileId: string; runId: string }): Promise<void> {
        const result = await this.captureFinishedRunMemory(input);
        if (result.isErr()) {
            appLog.warn({
                tag: 'memory-runtime',
                message: 'Finished run memory extraction failed without changing run state.',
                profileId: input.profileId,
                runId: input.runId,
                errorCode: result.error.code,
                errorMessage: result.error.message,
            });
            return;
        }

        if (result.value.action === 'skipped' || result.value.action === 'noop') {
            return;
        }

        appLog.info({
            tag: 'memory-runtime',
            message: 'Captured automatic finished run memory.',
            profileId: input.profileId,
            runId: input.runId,
            action: result.value.action,
            memoryId: result.value.memory?.id ?? null,
            previousMemoryId: result.value.previousMemory?.id ?? null,
        });
    }
}

export const memoryRuntimeService = new MemoryRuntimeService();
