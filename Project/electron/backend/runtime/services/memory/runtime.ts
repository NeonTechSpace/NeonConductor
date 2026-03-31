import {
    messageStore,
    memoryEvidenceStore,
    memoryStore,
    runStore,
    runUsageStore,
    threadStore,
    toolResultArtifactStore,
} from '@/app/backend/persistence/stores';
import type { MemoryRecord } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    buildAutomaticRunMemorySnapshot,
    resolveAutomaticRunMemoryDecision,
    type AutomaticRunMemoryAction,
} from '@/app/backend/runtime/services/memory/automaticRunMemoryLifecycle';
import { memoryConsolidationService } from '@/app/backend/runtime/services/memory/memoryConsolidationService';
import { memoryService } from '@/app/backend/runtime/services/memory/service';
import { appLog } from '@/app/main/logging';

function isFinishedRunStatus(status: string): status is 'completed' | 'error' {
    return status === 'completed' || status === 'error';
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
        if (!isFinishedRunStatus(run.status)) {
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
        const [toolArtifacts, runScopedEvidence] = await Promise.all([
            toolResultArtifactStore.listByMessagePartIds(parts.map((part) => part.id)),
            memoryEvidenceStore.listByMemoryIds(
                input.profileId,
                runScopedMemories.map((memory) => memory.id)
            ),
        ]);
        const runScopedEvidenceByMemoryId = new Map<string, typeof runScopedEvidence>();
        for (const evidence of runScopedEvidence) {
            const existing = runScopedEvidenceByMemoryId.get(evidence.memoryId) ?? [];
            existing.push(evidence);
            runScopedEvidenceByMemoryId.set(evidence.memoryId, existing);
        }

        const snapshot = buildAutomaticRunMemorySnapshot({
            run: {
                id: run.id,
                sessionId: run.sessionId,
                prompt: run.prompt,
                status: run.status,
                providerId: run.providerId,
                modelId: run.modelId,
                ...(run.errorMessage ? { errorMessage: run.errorMessage } : {}),
            },
            ...(sessionThread ? { sessionThread: { thread: { id: sessionThread.thread.id } } } : {}),
            usage,
            messages,
            parts,
            toolArtifacts,
            runScopedMemories,
            runScopedEvidenceByMemoryId,
        });
        const decision = resolveAutomaticRunMemoryDecision(snapshot);

        if (decision.action === 'noop') {
            return okOp({
                action: 'noop',
                ...(decision.activeAutomaticMemory ? { memory: decision.activeAutomaticMemory } : {}),
            });
        }

        if (decision.action === 'superseded') {
            const superseded = await memoryService.supersedeMemory({
                profileId: input.profileId,
                memoryId: decision.activeAutomaticMemory!.id,
                createdByKind: 'system',
                title: snapshot.title,
                bodyMarkdown: snapshot.bodyMarkdown,
                summaryText: snapshot.summaryText,
                metadata: snapshot.metadata,
                revisionReason: 'runtime_refresh',
                evidence: snapshot.evidence,
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
            title: snapshot.title,
            bodyMarkdown: snapshot.bodyMarkdown,
            summaryText: snapshot.summaryText,
            metadata: snapshot.metadata,
            evidence: snapshot.evidence,
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

        if (result.value.memory?.id) {
            await memoryConsolidationService.consolidateFromRunMemorySafely({
                profileId: input.profileId,
                memoryId: result.value.memory.id,
            });
        }
    }
}

export const memoryRuntimeService = new MemoryRuntimeService();
