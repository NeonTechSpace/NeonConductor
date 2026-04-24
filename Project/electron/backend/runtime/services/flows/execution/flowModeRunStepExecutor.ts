import type { FlowInstancePersistenceRecord } from '@/app/backend/persistence/types';
import type { FlowModeRunStepDefinition } from '@/app/backend/runtime/contracts';
import {
    abortDelegatedChildRun,
    resolveDelegatedChildRootExecutionContext,
    startDelegatedChildLaneRun,
    waitForRunTerminal,
} from '@/app/backend/runtime/services/common/delegatedChildLane';
import { defaultFlowRuntimeOptions } from '@/app/backend/runtime/services/flows/defaultRuntimeOptions';
import type {
    FlowStepProvenance,
    StepExecutionResult,
} from '@/app/backend/runtime/services/flows/execution/flowExecutionTypes';
import {
    readModeRunThreadTitle,
    wasSignalAborted,
} from '@/app/backend/runtime/services/flows/execution/flowStepHelpers';
import type { FlowExecutionService } from '@/app/backend/runtime/services/flows/executionService';
import { resolveModeExecution } from '@/app/backend/runtime/services/runExecution/mode';

export async function executeModeRunStep(
    host: FlowExecutionService,
    input: {
        profileId: string;
        record: FlowInstancePersistenceRecord;
        stepIndex: number;
        step: FlowModeRunStepDefinition;
        signal: AbortSignal;
    }
): Promise<StepExecutionResult> {
    if (input.signal.aborted) {
        return {
            kind: 'terminal',
            view: await host.markCancelled({
                profileId: input.profileId,
                record: input.record,
                reason: 'Flow execution was cancelled.',
                step: input.step,
                stepIndex: input.stepIndex,
            }),
        };
    }

    const sessionId = input.record.instance.executionContext?.sessionId;
    if (!sessionId) {
        return {
            kind: 'terminal',
            view: await host.markFailed({
                profileId: input.profileId,
                record: input.record,
                message: 'Mode-run flow steps require a session-bound execution context.',
                step: input.step,
                stepIndex: input.stepIndex,
            }),
        };
    }

    const modeResolution = await resolveModeExecution({
        profileId: input.profileId,
        topLevelTab: input.step.topLevelTab,
        modeKey: input.step.modeKey,
        ...(input.record.instance.executionContext?.workspaceFingerprint
            ? { workspaceFingerprint: input.record.instance.executionContext.workspaceFingerprint }
            : {}),
    });
    if (modeResolution.isErr()) {
        return {
            kind: 'terminal',
            view: await host.markFailed({
                profileId: input.profileId,
                record: input.record,
                message: modeResolution.error.message,
                step: input.step,
                stepIndex: input.stepIndex,
            }),
        };
    }

    const rootContext = await resolveDelegatedChildRootExecutionContext({
        profileId: input.profileId,
        sessionId,
    });
    if (!rootContext) {
        return {
            kind: 'terminal',
            view: await host.markFailed({
                profileId: input.profileId,
                record: input.record,
                message: 'Flow mode-run step could not resolve a delegated child-lane root context.',
                step: input.step,
                stepIndex: input.stepIndex,
            }),
        };
    }

    const started = await startDelegatedChildLaneRun({
        profileId: input.profileId,
        owner: {
            kind: 'flow_instance',
            flowInstanceId: input.record.instance.id,
        },
        rootContext,
        rootSessionId: sessionId,
        childTitle: readModeRunThreadTitle(input.step),
        prompt: input.step.promptMarkdown,
        topLevelTab: input.step.topLevelTab,
        modeKey: input.step.modeKey,
        runtimeOptions: defaultFlowRuntimeOptions,
        ...(input.record.instance.executionContext?.workspaceFingerprint
            ? { workspaceFingerprint: input.record.instance.executionContext.workspaceFingerprint }
            : {}),
    });
    if (!started.accepted) {
        return {
            kind: 'terminal',
            view: await host.markFailed({
                profileId: input.profileId,
                record: input.record,
                message: started.reason,
                step: input.step,
                stepIndex: input.stepIndex,
            }),
        };
    }

    const provenance: FlowStepProvenance = {
        currentRunId: started.started.runId,
        currentChildThreadId: started.started.childThreadId,
        currentChildSessionId: started.started.childSessionId,
    };
    let record = await host.writeStepStarted(input.profileId, input.record, input.stepIndex, input.step, provenance);

    const abortChildRun = (): void => {
        void abortDelegatedChildRun(input.profileId, started.started.childSessionId);
    };
    input.signal.addEventListener('abort', abortChildRun, { once: true });

    try {
        const terminalStatus = await waitForRunTerminal(started.started.runId);
        if (terminalStatus === 'completed') {
            record = await host.writeStepCompleted({
                profileId: input.profileId,
                record,
                stepIndex: input.stepIndex,
                step: input.step,
                nextStepIndex: input.stepIndex + 1,
            });
            return {
                kind: 'continue',
                record,
            };
        }

        if (terminalStatus === 'aborted' && wasSignalAborted(input.signal)) {
            return {
                kind: 'terminal',
                view: await host.markCancelled({
                    profileId: input.profileId,
                    record,
                    reason: 'Flow execution was cancelled.',
                    step: input.step,
                    stepIndex: input.stepIndex,
                }),
            };
        }

        if (terminalStatus === 'error' && wasSignalAborted(input.signal)) {
            return {
                kind: 'terminal',
                view: await host.markCancelled({
                    profileId: input.profileId,
                    record,
                    reason: 'Flow execution was cancelled.',
                    step: input.step,
                    stepIndex: input.stepIndex,
                }),
            };
        }

        return {
            kind: 'terminal',
            view: await host.markFailed({
                profileId: input.profileId,
                record,
                message:
                    terminalStatus === 'aborted'
                        ? 'Delegated mode run was aborted before it completed.'
                        : 'Delegated mode run ended with error.',
                step: input.step,
                stepIndex: input.stepIndex,
            }),
        };
    } finally {
        input.signal.removeEventListener('abort', abortChildRun);
    }
}
