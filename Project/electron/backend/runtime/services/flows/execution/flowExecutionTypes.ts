import type { FlowInstancePersistenceRecord } from '@/app/backend/persistence/types';
import type { FlowInstanceRecord, FlowInstanceView } from '@/app/backend/runtime/contracts';

export type FlowStepProvenance = Partial<
    Pick<
        FlowInstanceRecord,
        | 'currentRunId'
        | 'currentChildThreadId'
        | 'currentChildSessionId'
        | 'currentPlanId'
        | 'currentPlanRevisionId'
        | 'currentPlanPhaseId'
        | 'currentPlanPhaseRevisionId'
    >
>;

export type StepExecutionResult =
    | { kind: 'continue'; record: FlowInstancePersistenceRecord }
    | { kind: 'terminal'; view: FlowInstanceView };
