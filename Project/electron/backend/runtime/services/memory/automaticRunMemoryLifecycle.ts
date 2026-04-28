import type {
    MessagePartRecord,
    MessageRecord,
    MemoryEvidenceRecord,
    MemoryRecord,
    RunRecord,
    RunUsageRecord,
    ToolResultArtifactRecord,
} from '@/app/backend/persistence/types';
import type { MemoryEvidenceCreateInput, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import {
    renderMemoryCanonicalBodyMarkdown,
    resolveMemoryCanonicalBody,
} from '@/app/backend/runtime/services/memory/memoryCanonicalBody';

type FinishedRunStatus = 'completed' | 'error';
export type AutomaticRunMemoryAction = 'created' | 'superseded' | 'noop' | 'skipped';

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

interface AutomaticRunMemoryLifecycleInput {
    run: Pick<RunRecord, 'id' | 'sessionId' | 'prompt' | 'status' | 'errorMessage'> & {
        status: FinishedRunStatus;
        providerId: RuntimeProviderId;
        modelId: string;
    };
    sessionThread?: {
        thread: {
            id: string;
        };
    } | null;
    usage: RunUsageRecord | null;
    messages: MessageRecord[];
    parts: MessagePartRecord[];
    toolArtifacts: ToolResultArtifactRecord[];
    runScopedMemories: MemoryRecord[];
    runScopedEvidenceByMemoryId: Map<string, MemoryEvidenceRecord[]>;
}

export interface AutomaticRunMemorySnapshot {
    activeAutomaticMemory?: MemoryRecord;
    activeAutomaticMemoryEvidence: MemoryEvidenceCreateInput[];
    title: string;
    summaryText: string;
    bodyMarkdown: string;
    metadata: RuntimeRunOutcomeMemoryMetadata;
    evidence: MemoryEvidenceCreateInput[];
}

export interface AutomaticRunMemoryDecision {
    action: AutomaticRunMemoryAction;
    activeAutomaticMemory?: MemoryRecord;
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

function truncateEvidenceExcerpt(value: string, maxLength = 240): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function isAutomaticRunOutcomeMemory(memory: MemoryRecord): boolean {
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

function selectAssistantEvidencePart(
    messages: MessageRecord[],
    partsByMessageId: Map<string, MessagePartRecord[]>
): MessagePartRecord | undefined {
    const assistantMessages = messages.filter((message) => message.role === 'assistant');
    for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
        const assistantMessage = assistantMessages[index];
        if (!assistantMessage) {
            continue;
        }

        const parts = partsByMessageId.get(assistantMessage.id) ?? [];
        for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
            const part = parts[partIndex];
            if (!part) {
                continue;
            }

            if (part.partType !== 'text' && part.partType !== 'reasoning_summary') {
                continue;
            }

            if (readTextPayload(part)) {
                return part;
            }
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

function buildToolResultEvidenceExcerpt(part: MessagePartRecord): string | undefined {
    const outputText = part.payload['outputText'];
    if (typeof outputText === 'string' && outputText.trim().length > 0) {
        return truncateEvidenceExcerpt(outputText);
    }

    const toolName = readToolName(part);
    const segments = [
        ...(toolName ? [`tool ${toolName}`] : []),
        ...(readToolError(part) ? ['reported an error'] : ['completed without persisted artifact']),
    ];

    return segments.length > 0 ? segments.join(' ') : undefined;
}

function buildMemoryEvidence(input: {
    runId: RunRecord['id'];
    assistantEvidencePart?: MessagePartRecord;
    toolResults: MessagePartRecord[];
    artifactsByMessagePartId: Map<string, ToolResultArtifactRecord>;
}): MemoryEvidenceCreateInput[] {
    const evidence: MemoryEvidenceCreateInput[] = [
        {
            kind: 'run',
            label: `Run ${input.runId}`,
            sourceRunId: input.runId,
        },
    ];

    if (input.assistantEvidencePart) {
        const assistantExcerpt = readTextPayload(input.assistantEvidencePart);
        evidence.push({
            kind: 'message_part',
            label:
                input.assistantEvidencePart.partType === 'reasoning_summary'
                    ? 'Assistant reasoning summary'
                    : 'Assistant output',
            ...(assistantExcerpt ? { excerptText: truncateEvidenceExcerpt(assistantExcerpt) } : {}),
            sourceRunId: input.runId,
            sourceMessageId: input.assistantEvidencePart.messageId,
            sourceMessagePartId: input.assistantEvidencePart.id,
        });
    }

    for (const toolResult of input.toolResults) {
        const artifact = input.artifactsByMessagePartId.get(toolResult.id);
        if (artifact) {
            evidence.push({
                kind: 'tool_result_artifact',
                label: `Tool artifact: ${artifact.toolName}`,
                ...(artifact.previewText ? { excerptText: truncateEvidenceExcerpt(artifact.previewText) } : {}),
                sourceRunId: artifact.runId,
                sourceMessageId: toolResult.messageId,
                sourceMessagePartId: artifact.messagePartId,
                metadata: {
                    artifactKind: artifact.artifactKind,
                    contentType: artifact.contentType,
                },
            });
            continue;
        }

        const toolResultExcerpt = buildToolResultEvidenceExcerpt(toolResult);
        evidence.push({
            kind: 'message_part',
            label: `Tool result: ${readToolName(toolResult) ?? 'unknown tool'}`,
            ...(toolResultExcerpt ? { excerptText: toolResultExcerpt } : {}),
            sourceRunId: input.runId,
            sourceMessageId: toolResult.messageId,
            sourceMessagePartId: toolResult.id,
            metadata: {
                isError: readToolError(toolResult),
            },
        });
    }

    return evidence;
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

function areEvidenceEqual(left: MemoryEvidenceCreateInput[], right: MemoryEvidenceCreateInput[]): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeBodyMarkdownForComparison(bodyMarkdown: string): string {
    return renderMemoryCanonicalBodyMarkdown(resolveMemoryCanonicalBody({ bodyMarkdown }));
}

function areBodyMarkdownEqual(storedBodyMarkdown: string, nextBodyMarkdown: string): boolean {
    return (
        storedBodyMarkdown === nextBodyMarkdown ||
        storedBodyMarkdown === normalizeBodyMarkdownForComparison(nextBodyMarkdown)
    );
}

function toEvidenceCreateInput(record: MemoryEvidenceRecord): MemoryEvidenceCreateInput {
    return {
        kind: record.kind,
        label: record.label,
        ...(record.excerptText ? { excerptText: record.excerptText } : {}),
        ...(record.sourceRunId ? { sourceRunId: record.sourceRunId } : {}),
        ...(record.sourceMessageId ? { sourceMessageId: record.sourceMessageId } : {}),
        ...(record.sourceMessagePartId ? { sourceMessagePartId: record.sourceMessagePartId } : {}),
        ...(Object.keys(record.metadata).length > 0 ? { metadata: record.metadata } : {}),
    };
}

export function buildAutomaticRunMemorySnapshot(input: AutomaticRunMemoryLifecycleInput): AutomaticRunMemorySnapshot {
    const automaticRunMemories = input.runScopedMemories.filter((memory) => isAutomaticRunOutcomeMemory(memory));
    const activeAutomaticMemory = automaticRunMemories.find((memory) => memory.state === 'active');
    const activeAutomaticMemoryEvidence = activeAutomaticMemory
        ? (input.runScopedEvidenceByMemoryId.get(activeAutomaticMemory.id) ?? []).map(toEvidenceCreateInput)
        : [];
    const partsByMessageId = buildMessagePartsByMessageId(input.parts);
    const assistantText = collectAssistantText(input.messages, partsByMessageId);
    const assistantEvidencePart = selectAssistantEvidencePart(input.messages, partsByMessageId);
    const toolResults = input.parts.filter((part) => part.partType === 'tool_result');
    const toolSummary = summarizeToolResults(input.parts);
    const usageSummary = formatUsageSummary(input.usage);
    const artifactsByMessagePartId = new Map(input.toolArtifacts.map((artifact) => [artifact.messagePartId, artifact]));
    const metadata = buildRuntimeMemoryMetadata({
        runId: input.run.id,
        sessionId: input.run.sessionId,
        ...(input.sessionThread ? { threadId: input.sessionThread.thread.id } : {}),
        runStatus: input.run.status,
        providerId: input.run.providerId,
        modelId: input.run.modelId,
        hasAssistantText: typeof assistantText === 'string' && assistantText.length > 0,
        toolCallCount: toolSummary.toolCallCount,
        toolErrorCount: toolSummary.toolErrorCount,
    });
    const evidence = buildMemoryEvidence({
        runId: input.run.id,
        ...(assistantEvidencePart ? { assistantEvidencePart } : {}),
        toolResults,
        artifactsByMessagePartId,
    });

    return {
        ...(activeAutomaticMemory ? { activeAutomaticMemory } : {}),
        activeAutomaticMemoryEvidence,
        title: buildMemoryTitle({
            prompt: input.run.prompt,
            runStatus: input.run.status,
        }),
        summaryText: buildMemorySummary({
            prompt: input.run.prompt,
            runStatus: input.run.status,
            providerId: input.run.providerId,
            modelId: input.run.modelId,
        }),
        bodyMarkdown: buildMemoryBody({
            prompt: input.run.prompt,
            runStatus: input.run.status,
            providerId: input.run.providerId,
            modelId: input.run.modelId,
            runId: input.run.id,
            sessionId: input.run.sessionId,
            ...(input.sessionThread ? { threadId: input.sessionThread.thread.id } : {}),
            ...(assistantText ? { assistantText } : {}),
            toolSummary,
            ...(usageSummary ? { usageSummary } : {}),
            ...(input.run.errorMessage ? { errorMessage: input.run.errorMessage } : {}),
        }),
        metadata,
        evidence,
    };
}

export function resolveAutomaticRunMemoryDecision(snapshot: AutomaticRunMemorySnapshot): AutomaticRunMemoryDecision {
    if (!snapshot.activeAutomaticMemory) {
        return {
            action: 'created',
        };
    }

    if (
        snapshot.activeAutomaticMemory.title === snapshot.title &&
        areBodyMarkdownEqual(snapshot.activeAutomaticMemory.bodyMarkdown, snapshot.bodyMarkdown) &&
        snapshot.activeAutomaticMemory.summaryText === snapshot.summaryText &&
        areMetadataEqual(snapshot.activeAutomaticMemory.metadata, snapshot.metadata) &&
        areEvidenceEqual(snapshot.activeAutomaticMemoryEvidence, snapshot.evidence)
    ) {
        return {
            action: 'noop',
            activeAutomaticMemory: snapshot.activeAutomaticMemory,
        };
    }

    return {
        action: 'superseded',
        activeAutomaticMemory: snapshot.activeAutomaticMemory,
    };
}
