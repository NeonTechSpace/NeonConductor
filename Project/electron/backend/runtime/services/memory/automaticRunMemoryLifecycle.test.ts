import { describe, expect, it } from 'vitest';

import type { MessagePartRecord, MessageRecord, MemoryRecord, RunUsageRecord } from '@/app/backend/persistence/types';
import {
    buildAutomaticRunMemorySnapshot,
    isAutomaticRunOutcomeMemory,
    resolveAutomaticRunMemoryDecision,
} from '@/app/backend/runtime/services/memory/automaticRunMemoryLifecycle';
import { requireEntityId } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

function createMessageRecord(overrides: Partial<MessageRecord>): MessageRecord {
    return {
        id: requireEntityId(overrides.id ?? 'msg_memory_auto_1', 'msg', 'Expected message id.'),
        profileId: overrides.profileId ?? 'profile_memory_auto',
        sessionId: requireEntityId(
            String(overrides.sessionId ?? 'sess_memory_auto_1'),
            'sess',
            'Expected session id.'
        ),
        runId: requireEntityId(String(overrides.runId ?? 'run_memory_auto_1'), 'run', 'Expected run id.'),
        role: overrides.role ?? 'assistant',
        createdAt: overrides.createdAt ?? '2026-03-27T00:00:00.000Z',
        updatedAt: overrides.updatedAt ?? '2026-03-27T00:00:00.000Z',
    };
}

function createMessagePartRecord(overrides: Partial<MessagePartRecord>): MessagePartRecord {
    return {
        id: requireEntityId(overrides.id ?? 'part_memory_auto_1', 'part', 'Expected message part id.'),
        messageId: requireEntityId(
            String(overrides.messageId ?? 'msg_memory_auto_1'),
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
            runScopedMemories: [],
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
            runScopedMemories: [],
        });
        const matchingMemory = createMemoryRecord({
            title: snapshot.title,
            summaryText: snapshot.summaryText,
            bodyMarkdown: snapshot.bodyMarkdown,
            metadata: snapshot.metadata,
            threadId,
            runId,
        });
        const matchingDecision = resolveAutomaticRunMemoryDecision({
            ...snapshot,
            activeAutomaticMemory: matchingMemory,
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
            runScopedMemories: [matchingMemory],
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
            runScopedMemories: [],
        });

        const decision = resolveAutomaticRunMemoryDecision(snapshot);

        expect(decision.action).toBe('created');
        expect(decision.activeAutomaticMemory).toBeUndefined();
    });
});
