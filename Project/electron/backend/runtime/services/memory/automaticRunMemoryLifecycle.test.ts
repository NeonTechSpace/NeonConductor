import { describe, expect, it } from 'vitest';

import type {
    MessagePartRecord,
    MessageRecord,
    MemoryEvidenceRecord,
    MemoryRecord,
    RunUsageRecord,
    ToolResultArtifactRecord,
} from '@/app/backend/persistence/types';
import {
    buildAutomaticRunMemorySnapshot,
    isAutomaticRunOutcomeMemory,
    resolveAutomaticRunMemoryDecision,
} from '@/app/backend/runtime/services/memory/automaticRunMemoryLifecycle';
import { createMemoryCanonicalBodyFromMarkdown } from '@/app/backend/runtime/services/memory/memoryCanonicalBody';
import { requireEntityId } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

function createMessageRecord(overrides: Partial<MessageRecord>): MessageRecord {
    return {
        id: requireEntityId(overrides.id ?? 'msg_memory_auto_1', 'msg', 'Expected message id.'),
        profileId: overrides.profileId ?? 'profile_memory_auto',
        sessionId: requireEntityId(
            overrides.sessionId ?? 'sess_memory_auto_1',
            'sess',
            'Expected session id.'
        ),
        runId: requireEntityId(overrides.runId ?? 'run_memory_auto_1', 'run', 'Expected run id.'),
        role: overrides.role ?? 'assistant',
        createdAt: overrides.createdAt ?? '2026-03-27T00:00:00.000Z',
        updatedAt: overrides.updatedAt ?? '2026-03-27T00:00:00.000Z',
    };
}

function createMessagePartRecord(overrides: Partial<MessagePartRecord>): MessagePartRecord {
    return {
        id: requireEntityId(overrides.id ?? 'part_memory_auto_1', 'part', 'Expected message part id.'),
        messageId: requireEntityId(
            overrides.messageId ?? 'msg_memory_auto_1',
            'msg',
            'Expected message id.'
        ),
        sequence: overrides.sequence ?? 1,
        partType: overrides.partType ?? 'text',
        payload: overrides.payload ?? {
            text: 'Recovered implementation details.',
        },
        createdAt: overrides.createdAt ?? '2026-03-27T00:00:00.000Z',
    };
}

function createMemoryRecord(overrides: Partial<MemoryRecord>): MemoryRecord {
    const record: MemoryRecord = {
        id: requireEntityId(overrides.id ?? 'mem_memory_auto_1', 'mem', 'Expected memory id.'),
        profileId: overrides.profileId ?? 'profile_memory_auto',
        memoryType: overrides.memoryType ?? 'episodic',
        scopeKind: overrides.scopeKind ?? 'run',
        state: overrides.state ?? 'active',
        createdByKind: overrides.createdByKind ?? 'system',
        title: overrides.title ?? 'Completed run: Summarize the implementation',
        canonicalBody: createMemoryCanonicalBodyFromMarkdown(
            overrides.bodyMarkdown ??
                '# Run outcome\n\n- Status: completed\n- Provider/model: openai/openai/gpt-5\n- Run id: run_memory_auto_1\n- Session id: sess_memory_auto_1'
        ),
        bodyMarkdown:
            overrides.bodyMarkdown ??
            '# Run outcome\n\n- Status: completed\n- Provider/model: openai/openai/gpt-5\n- Run id: run_memory_auto_1\n- Session id: sess_memory_auto_1',
        summaryText: overrides.summaryText ?? 'Completed run on openai/openai/gpt-5 for "Summarize the implementation".',
        metadata:
            overrides.metadata ??
            {
                source: 'runtime_run_outcome',
                extractionVersion: 1,
                runId: 'run_memory_auto_1',
                sessionId: 'sess_memory_auto_1',
                threadId: 'thr_memory_auto_1',
                runStatus: 'completed',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                hasAssistantText: true,
                toolCallCount: 1,
                toolErrorCount: 0,
            },
        workspaceFingerprint: overrides.workspaceFingerprint ?? 'wsf_memory_auto',
        threadId: overrides.threadId ?? requireEntityId('thr_memory_auto_1', 'thr', 'Expected thread id.'),
        runId: overrides.runId ?? requireEntityId('run_memory_auto_1', 'run', 'Expected run id.'),
        createdAt: overrides.createdAt ?? '2026-03-27T00:00:00.000Z',
        updatedAt: overrides.updatedAt ?? '2026-03-27T00:00:00.000Z',
    };

    if (overrides.supersededByMemoryId) {
        record.supersededByMemoryId = overrides.supersededByMemoryId;
    }

    return record;
}

function createMemoryEvidenceRecord(overrides: Partial<MemoryEvidenceRecord>): MemoryEvidenceRecord {
    return {
        id: requireEntityId(overrides.id ?? 'mev_memory_auto_1', 'mev', 'Expected memory evidence id.'),
        profileId: overrides.profileId ?? 'profile_memory_auto',
        memoryId: overrides.memoryId ?? requireEntityId('mem_memory_auto_1', 'mem', 'Expected memory id.'),
        sequence: overrides.sequence ?? 0,
        kind: overrides.kind ?? 'run',
        label: overrides.label ?? 'Run run_memory_auto_1',
        metadata: overrides.metadata ?? {},
        createdAt: overrides.createdAt ?? '2026-03-27T00:00:00.000Z',
        ...(overrides.excerptText ? { excerptText: overrides.excerptText } : {}),
        ...(overrides.sourceRunId ? { sourceRunId: overrides.sourceRunId } : {}),
        ...(overrides.sourceMessageId ? { sourceMessageId: overrides.sourceMessageId } : {}),
        ...(overrides.sourceMessagePartId ? { sourceMessagePartId: overrides.sourceMessagePartId } : {}),
    };
}

function createToolResultArtifactRecord(overrides: Partial<ToolResultArtifactRecord>): ToolResultArtifactRecord {
    return {
        messagePartId: overrides.messagePartId ?? requireEntityId('part_memory_auto_2', 'part', 'Expected part id.'),
        profileId: overrides.profileId ?? 'profile_memory_auto',
        sessionId: overrides.sessionId ?? requireEntityId('sess_memory_auto_1', 'sess', 'Expected session id.'),
        runId: overrides.runId ?? requireEntityId('run_memory_auto_1', 'run', 'Expected run id.'),
        toolName: overrides.toolName ?? 'run_command',
        artifactKind: overrides.artifactKind ?? 'command_output',
        contentType: overrides.contentType ?? 'text/plain',
        storageKind: overrides.storageKind ?? 'text_inline_db',
        totalBytes: overrides.totalBytes ?? 2,
        totalLines: overrides.totalLines ?? 1,
        previewText: overrides.previewText ?? 'ok',
        previewStrategy: overrides.previewStrategy ?? 'head_only',
        metadata: overrides.metadata ?? {},
        createdAt: overrides.createdAt ?? '2026-03-27T00:00:00.000Z',
        updatedAt: overrides.updatedAt ?? '2026-03-27T00:00:00.000Z',
        ...(overrides.rawText ? { rawText: overrides.rawText } : { rawText: 'ok' }),
        ...(overrides.filePath ? { filePath: overrides.filePath } : {}),
    };
}

describe('automaticRunMemoryLifecycle', () => {
    const runId = requireEntityId('run_memory_auto_1', 'run', 'Expected run id.');
    const sessionId = requireEntityId('sess_memory_auto_1', 'sess', 'Expected session id.');
    const threadId = requireEntityId('thr_memory_auto_1', 'thr', 'Expected thread id.');

    const baseRun = {
        id: runId,
        sessionId,
        prompt: 'Summarize the implementation.',
        status: 'completed' as const,
        providerId: 'openai' as const,
        modelId: 'openai/gpt-5',
    };

    const baseUsage: RunUsageRecord = {
        runId,
        providerId: 'openai',
        modelId: 'openai/gpt-5',
        totalTokens: 42,
        outputTokens: 24,
        inputTokens: 18,
        billedVia: 'openai_api',
        recordedAt: '2026-03-27T00:00:00.000Z',
    };

    const baseMessages: MessageRecord[] = [
        createMessageRecord({
            id: 'msg_memory_auto_1',
            role: 'assistant',
            profileId: 'profile_memory_auto',
            sessionId,
            runId,
        }),
    ];

    const baseParts: MessagePartRecord[] = [
        createMessagePartRecord({
            id: 'part_memory_auto_1',
            messageId: 'msg_memory_auto_1',
            partType: 'text',
            payload: {
                text: 'Recovered implementation details.',
            },
        }),
        createMessagePartRecord({
            id: 'part_memory_auto_2',
            messageId: 'msg_memory_auto_1',
            partType: 'tool_result',
            payload: {
                callId: 'call_1',
                toolName: 'run_command',
                outputText: 'ok',
                isError: false,
            },
        }),
    ];

    it('builds a clear automatic run-memory snapshot and marks matching memory as automatic', () => {
        const snapshot = buildAutomaticRunMemorySnapshot({
            run: baseRun,
            sessionThread: {
                thread: {
                    id: threadId,
                },
            },
            usage: baseUsage,
            messages: baseMessages,
            parts: baseParts,
            toolArtifacts: [createToolResultArtifactRecord({})],
            runScopedMemories: [],
            runScopedEvidenceByMemoryId: new Map(),
        });

        expect(snapshot.title).toBe('Completed run: Summarize the implementation.');
        expect(snapshot.summaryText).toContain('Completed run on openai/openai/gpt-5');
        expect(snapshot.bodyMarkdown).toContain('Recovered implementation details.');
        expect(snapshot.bodyMarkdown).toContain('Tool calls: 1');
        expect(snapshot.bodyMarkdown).toContain('total 42 tokens');
        expect(snapshot.metadata).toMatchObject({
            source: 'runtime_run_outcome',
            extractionVersion: 1,
            runId,
            sessionId,
            threadId,
            runStatus: 'completed',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            hasAssistantText: true,
            toolCallCount: 1,
            toolErrorCount: 0,
        });
        expect(snapshot.evidence.map((evidence) => evidence.kind)).toEqual([
            'run',
            'message_part',
            'tool_result_artifact',
        ]);
        expect(snapshot.evidence[1]?.label).toBe('Assistant output');
        expect(snapshot.evidence[2]).toMatchObject({
            kind: 'tool_result_artifact',
            label: 'Tool artifact: run_command',
            sourceMessagePartId: baseParts[1]?.id,
        });

        const activeAutomaticMemory = createMemoryRecord({
            title: snapshot.title,
            summaryText: snapshot.summaryText,
            bodyMarkdown: snapshot.bodyMarkdown,
            metadata: snapshot.metadata,
            threadId,
            runId,
        });

        expect(isAutomaticRunOutcomeMemory(activeAutomaticMemory)).toBe(true);
    });

    it('treats a matching active automatic memory as noop and a changed one as superseded', () => {
        const snapshot = buildAutomaticRunMemorySnapshot({
            run: baseRun,
            sessionThread: {
                thread: {
                    id: threadId,
                },
            },
            usage: baseUsage,
            messages: baseMessages,
            parts: baseParts,
            toolArtifacts: [createToolResultArtifactRecord({})],
            runScopedMemories: [],
            runScopedEvidenceByMemoryId: new Map(),
        });
        const matchingMemory = createMemoryRecord({
            title: snapshot.title,
            summaryText: snapshot.summaryText,
            bodyMarkdown: snapshot.bodyMarkdown,
            metadata: snapshot.metadata,
            threadId,
            runId,
        });
        const matchingEvidence = snapshot.evidence.map((evidence, index) =>
            createMemoryEvidenceRecord({
                id: `mev_memory_auto_${String(index + 1)}`,
                memoryId: matchingMemory.id,
                sequence: index,
                kind: evidence.kind,
                label: evidence.label,
                ...(evidence.excerptText ? { excerptText: evidence.excerptText } : {}),
                ...(evidence.sourceRunId ? { sourceRunId: evidence.sourceRunId } : {}),
                ...(evidence.sourceMessageId ? { sourceMessageId: evidence.sourceMessageId } : {}),
                ...(evidence.sourceMessagePartId ? { sourceMessagePartId: evidence.sourceMessagePartId } : {}),
                metadata: evidence.metadata ?? {},
            })
        );
        const matchingDecision = resolveAutomaticRunMemoryDecision({
            ...snapshot,
            activeAutomaticMemory: matchingMemory,
            activeAutomaticMemoryEvidence: matchingEvidence.map((evidence) => ({
                kind: evidence.kind,
                label: evidence.label,
                ...(evidence.excerptText ? { excerptText: evidence.excerptText } : {}),
                ...(evidence.sourceRunId ? { sourceRunId: evidence.sourceRunId } : {}),
                ...(evidence.sourceMessageId ? { sourceMessageId: evidence.sourceMessageId } : {}),
                ...(evidence.sourceMessagePartId ? { sourceMessagePartId: evidence.sourceMessagePartId } : {}),
                ...(Object.keys(evidence.metadata).length > 0 ? { metadata: evidence.metadata } : {}),
            })),
        });

        expect(matchingDecision.action).toBe('noop');
        expect(matchingDecision.activeAutomaticMemory).toBe(matchingMemory);

        const changedSnapshot = buildAutomaticRunMemorySnapshot({
            run: baseRun,
            sessionThread: {
                thread: {
                    id: threadId,
                },
            },
            usage: {
                ...baseUsage,
                totalTokens: 99,
            },
            messages: baseMessages,
            parts: baseParts,
            toolArtifacts: [createToolResultArtifactRecord({})],
            runScopedMemories: [matchingMemory],
            runScopedEvidenceByMemoryId: new Map([[matchingMemory.id, matchingEvidence]]),
        });
        const changedDecision = resolveAutomaticRunMemoryDecision(changedSnapshot);

        expect(changedDecision.action).toBe('superseded');
        expect(changedDecision.activeAutomaticMemory).toBe(matchingMemory);
    });

    it('creates a new automatic run-memory when no active automatic memory exists', () => {
        const snapshot = buildAutomaticRunMemorySnapshot({
            run: baseRun,
            sessionThread: {
                thread: {
                    id: threadId,
                },
            },
            usage: baseUsage,
            messages: baseMessages,
            parts: baseParts,
            toolArtifacts: [createToolResultArtifactRecord({})],
            runScopedMemories: [],
            runScopedEvidenceByMemoryId: new Map(),
        });

        const decision = resolveAutomaticRunMemoryDecision(snapshot);

        expect(decision.action).toBe('created');
        expect(decision.activeAutomaticMemory).toBeUndefined();
    });

    it('falls back to message-part evidence when a tool result has no persisted artifact', () => {
        const snapshot = buildAutomaticRunMemorySnapshot({
            run: baseRun,
            sessionThread: {
                thread: {
                    id: threadId,
                },
            },
            usage: baseUsage,
            messages: baseMessages,
            parts: baseParts,
            toolArtifacts: [],
            runScopedMemories: [],
            runScopedEvidenceByMemoryId: new Map(),
        });

        expect(snapshot.evidence.map((evidence) => evidence.kind)).toEqual(['run', 'message_part', 'message_part']);
        expect(snapshot.evidence[2]).toMatchObject({
            kind: 'message_part',
            label: 'Tool result: run_command',
            sourceMessagePartId: baseParts[1]?.id,
        });
    });
});
