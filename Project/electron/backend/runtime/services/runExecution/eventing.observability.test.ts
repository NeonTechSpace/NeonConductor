import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunRecord } from '@/app/backend/persistence/types';
import { emitToolResultObservabilityEvent, emitTransportSelectionEvent } from '@/app/backend/runtime/services/runExecution/eventing';
import { neonObservabilityService } from '@/app/backend/runtime/services/observability/service';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

describe('runExecution observability eventing', () => {
    beforeEach(() => {
        neonObservabilityService.resetForTests();
        vi.spyOn(runtimeEventLogService, 'append').mockResolvedValue({} as never);
    });

    it('publishes transport selection observability events from persisted run metadata', async () => {
        await emitTransportSelectionEvent({
            profileId: 'profile_default',
            sessionId: 'sess_alpha',
            runId: 'run_alpha',
            selection: {
                selected: 'openai_chat_completions',
                requested: 'auto',
                degraded: true,
                degradedReason: 'fallback',
            },
            run: {
                id: 'run_alpha',
                sessionId: 'sess_alpha',
                profileId: 'profile_default',
                prompt: 'test',
                status: 'running',
                providerId: 'openai',
                modelId: 'gpt-test',
                createdAt: '2026-03-25T10:00:00.000Z',
                updatedAt: '2026-03-25T10:00:00.000Z',
            } satisfies RunRecord,
        });

        expect(neonObservabilityService.list({}, 10)[0]).toMatchObject({
            kind: 'transport_selected',
            selectedTransportFamily: 'openai_chat_completions',
            degraded: true,
            degradedReason: 'fallback',
        });
    });

    it('publishes tool result chunks for runtime tool outputs', () => {
        emitToolResultObservabilityEvent({
            profileId: 'profile_default',
            sessionId: 'sess_alpha',
            runId: 'run_alpha',
            providerId: 'openai',
            modelId: 'gpt-test',
            toolCallId: 'call_1',
            toolName: 'read_file',
            outputText: '{"ok":true}',
            isError: false,
        });

        expect(neonObservabilityService.list({}, 10)[0]).toMatchObject({
            kind: 'stream_chunk',
            chunk: {
                kind: 'tool_result',
                toolCallId: 'call_1',
                toolName: 'read_file',
                outputText: '{"ok":true}',
                isError: false,
            },
        });
    });
});
