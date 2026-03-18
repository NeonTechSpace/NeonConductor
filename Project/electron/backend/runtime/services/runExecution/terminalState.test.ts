import { afterEach, describe, expect, it, vi } from 'vitest';

import { runStore, sessionStore } from '@/app/backend/persistence/stores';
import type { RunRecord, RuntimeEventRecordV1 } from '@/app/backend/persistence/types';
import { memoryRuntimeService } from '@/app/backend/runtime/services/memory/runtime';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { moveRunToAbortedState, moveRunToFailedState } from '@/app/backend/runtime/services/runExecution/terminalState';
import { appLog } from '@/app/main/logging';

function createRunRecord(overrides?: Partial<RunRecord>): RunRecord {
    return {
        id: 'run_test',
        sessionId: 'sess_test',
        profileId: 'profile_test',
        prompt: 'Hello',
        status: 'running',
        providerId: 'openai',
        modelId: 'openai/gpt-5',
        authMethod: 'api_key',
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z',
        ...overrides,
    };
}

function createRuntimeEventRecord(event: {
    entityType: RuntimeEventRecordV1['entityType'];
    domain: RuntimeEventRecordV1['domain'];
    operation: RuntimeEventRecordV1['operation'];
    entityId: string;
    eventType: string;
    payload: Record<string, unknown>;
}): RuntimeEventRecordV1 {
    return {
        sequence: 1,
        eventId: 'evt_test',
        entityType: event.entityType,
        domain: event.domain,
        operation: event.operation,
        entityId: event.entityId,
        eventType: event.eventType,
        payload: event.payload,
        createdAt: '2026-03-13T00:00:00.000Z',
    };
}

describe('run terminal state events', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emits run snapshots for aborted runs', async () => {
        const finalizeSpy = vi.spyOn(runStore, 'finalize').mockResolvedValue(
            createRunRecord({
                status: 'aborted',
                abortedAt: '2026-03-13T00:01:00.000Z',
            })
        );
        const markRunTerminalSpy = vi.spyOn(sessionStore, 'markRunTerminal').mockResolvedValue();
        const appendSpy = vi.spyOn(runtimeEventLogService, 'append').mockImplementation(async (event) =>
            createRuntimeEventRecord(event)
        );
        const infoSpy = vi.spyOn(appLog, 'info').mockImplementation(() => {});
        const memorySpy = vi.spyOn(memoryRuntimeService, 'captureFinishedRunMemorySafely').mockResolvedValue();

        await moveRunToAbortedState({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            runId: 'run_test',
            logMessage: 'aborted',
        });

        expect(finalizeSpy).toHaveBeenCalledWith('run_test', {
            status: 'aborted',
        });
        expect(markRunTerminalSpy).toHaveBeenCalledWith('profile_test', 'sess_test', 'aborted');
        expect(appendSpy).toHaveBeenCalledTimes(1);
        const abortedEvent = appendSpy.mock.calls[0]?.[0] as { payload: { run: RunRecord } } | undefined;
        expect(abortedEvent?.payload.run.status).toBe('aborted');
        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(memorySpy).not.toHaveBeenCalled();
    });

    it('emits run snapshots for failed runs', async () => {
        const finalizeSpy = vi.spyOn(runStore, 'finalize').mockResolvedValue(
            createRunRecord({
                status: 'error',
                errorCode: 'provider_request_failed',
                errorMessage: 'boom',
            })
        );
        const markRunTerminalSpy = vi.spyOn(sessionStore, 'markRunTerminal').mockResolvedValue();
        const appendSpy = vi.spyOn(runtimeEventLogService, 'append').mockImplementation(async (event) =>
            createRuntimeEventRecord(event)
        );
        const warnSpy = vi.spyOn(appLog, 'warn').mockImplementation(() => {});
        const memorySpy = vi.spyOn(memoryRuntimeService, 'captureFinishedRunMemorySafely').mockResolvedValue();

        await moveRunToFailedState({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            runId: 'run_test',
            errorCode: 'provider_request_failed',
            errorMessage: 'boom',
            logMessage: 'failed',
        });

        expect(finalizeSpy).toHaveBeenCalledWith('run_test', {
            status: 'error',
            errorCode: 'provider_request_failed',
            errorMessage: 'boom',
        });
        expect(markRunTerminalSpy).toHaveBeenCalledWith('profile_test', 'sess_test', 'error');
        expect(appendSpy).toHaveBeenCalledTimes(1);
        const failedEvent = appendSpy.mock.calls[0]?.[0] as { payload: { run: RunRecord } } | undefined;
        expect(failedEvent?.payload.run.errorCode).toBe('provider_request_failed');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(memorySpy).toHaveBeenCalledWith({
            profileId: 'profile_test',
            runId: 'run_test',
        });
    });
});
