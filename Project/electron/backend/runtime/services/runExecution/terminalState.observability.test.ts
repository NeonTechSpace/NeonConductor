import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runStore, sessionStore } from '@/app/backend/persistence/stores';
import { memoryRuntimeService } from '@/app/backend/runtime/services/memory/runtime';
import { neonObservabilityService } from '@/app/backend/runtime/services/observability/service';
import { moveRunToAbortedState, moveRunToFailedState } from '@/app/backend/runtime/services/runExecution/terminalState';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

describe('terminalState observability', () => {
    beforeEach(() => {
        neonObservabilityService.resetForTests();
        vi.spyOn(runtimeEventLogService, 'append').mockResolvedValue({} as never);
        vi.spyOn(sessionStore, 'markRunTerminal').mockResolvedValue(undefined);
        vi.spyOn(memoryRuntimeService, 'captureFinishedRunMemorySafely').mockResolvedValue(undefined);
    });

    it('publishes failed run events with error chunks', async () => {
        vi.spyOn(runStore, 'finalize').mockResolvedValue({
            id: 'run_alpha',
            sessionId: 'sess_alpha',
            profileId: 'profile_default',
            prompt: 'test',
            status: 'error',
            providerId: 'openai',
            modelId: 'gpt-test',
            errorCode: 'provider_request_failed',
            errorMessage: 'boom',
            createdAt: '2026-03-25T10:00:00.000Z',
            updatedAt: '2026-03-25T10:00:00.000Z',
        } as never);

        await moveRunToFailedState({
            profileId: 'profile_default',
            sessionId: 'sess_alpha',
            runId: 'run_alpha',
            errorCode: 'provider_request_failed',
            errorMessage: 'boom',
            logMessage: 'failed',
        });

        expect(neonObservabilityService.list({}, 10)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'run_failed',
                    errorCode: 'provider_request_failed',
                }),
                expect.objectContaining({
                    kind: 'stream_chunk',
                    chunk: expect.objectContaining({
                        kind: 'error',
                        code: 'provider_request_failed',
                        message: 'boom',
                    }),
                }),
            ])
        );
    });

    it('publishes aborted run events with aborted error chunks', async () => {
        vi.spyOn(runStore, 'finalize').mockResolvedValue({
            id: 'run_alpha',
            sessionId: 'sess_alpha',
            profileId: 'profile_default',
            prompt: 'test',
            status: 'aborted',
            providerId: 'openai',
            modelId: 'gpt-test',
            createdAt: '2026-03-25T10:00:00.000Z',
            updatedAt: '2026-03-25T10:00:00.000Z',
        } as never);

        await moveRunToAbortedState({
            profileId: 'profile_default',
            sessionId: 'sess_alpha',
            runId: 'run_alpha',
            logMessage: 'aborted',
        });

        expect(neonObservabilityService.list({}, 10)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'run_aborted',
                }),
                expect.objectContaining({
                    kind: 'stream_chunk',
                    chunk: expect.objectContaining({
                        kind: 'error',
                        code: 'aborted',
                    }),
                }),
            ])
        );
    });
});
