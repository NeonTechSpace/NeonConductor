import { orchestratorExecutionStrategies, topLevelTabs } from '@/app/backend/runtime/contracts/enums';
import type { OrchestratorExecutionStrategy } from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readBoolean,
    parseRuntimeRunOptions,
    readArray,
    readEntityId,
    readEnumValue,
    readObject,
    readOptionalNumber,
    readOptionalString,
    readProfileId,
    readProviderId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    PlanAbortResearchBatchInput,
    PlanActivateVariantInput,
    PlanAnswerQuestionInput,
    PlanApproveInput,
    PlanApprovePhaseInput,
    PlanCancelInput,
    PlanCancelPhaseInput,
    PlanCreateVariantInput,
    PlanGenerateDraftInput,
    PlanGetActiveInput,
    PlanGetInput,
    PlanExpandNextPhaseInput,
    PlanImplementInput,
    PlanImplementPhaseInput,
    PlanAdvancedSnapshotInput,
    PlanPhaseDraftItemInput,
    PlanPhaseRecordView,
    PlanPhaseRevisionItemView,
    PlanPhaseRevisionView,
    PlanPhaseVerificationDiscrepancyInput,
    PlanPhaseVerificationDiscrepancyView,
    PlanPhaseVerificationView,
    PlanRaiseFollowUpInput,
    PlanReviseInput,
    PlanRevisePhaseInput,
    PlanResolveFollowUpInput,
    PlanResumeFromRevisionInput,
    PlanStartPhaseReplanInput,
    PlanEnterAdvancedPlanningInput,
    PlanStartInput,
    PlanStartResearchBatchInput,
    PlanVerifyPhaseInput,
} from '@/app/backend/runtime/contracts/types';

function readOrchestratorExecutionStrategy(value: unknown): OrchestratorExecutionStrategy {
    if (value === 'delegate') {
        return 'sequential';
    }

    return readEnumValue(value, 'executionStrategy', orchestratorExecutionStrategies);
}

function readPositiveInteger(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid "${field}": expected positive integer.`);
    }

    return value;
}

export function parsePlanStartInput(input: unknown): PlanStartInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const planningDepth =
        source.planningDepth !== undefined
            ? readEnumValue(source.planningDepth, 'planningDepth', ['simple', 'advanced'] as const)
            : undefined;

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        prompt: readString(source.prompt, 'prompt'),
        ...(planningDepth ? { planningDepth } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parsePlanStartResearchBatchInput(input: unknown): PlanStartResearchBatchInput {
    const source = readObject(input, 'input');
    const workerCount = readOptionalNumber(source.workerCount, 'workerCount');
    const providerId = source.providerId !== undefined ? readProviderId(source.providerId, 'providerId') : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    if (workerCount === undefined || !Number.isInteger(workerCount) || workerCount <= 0) {
        throw new Error('Invalid "workerCount": expected positive integer.');
    }

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        promptMarkdown: readString(source.promptMarkdown, 'promptMarkdown'),
        workerCount,
        runtimeOptions: parseRuntimeRunOptions(source.runtimeOptions),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parsePlanAbortResearchBatchInput(input: unknown): PlanAbortResearchBatchInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        researchBatchId: readEntityId(source.researchBatchId, 'researchBatchId', 'prb'),
    };
}

function parsePlanPhaseOutlineInput(input: unknown, field: string): PlanAdvancedSnapshotInput['phases'][number] {
    const source = readObject(input, field);
    const sequence = readOptionalNumber(source.sequence, `${field}.sequence`);
    if (sequence === undefined || !Number.isInteger(sequence) || sequence <= 0) {
        throw new Error(`Invalid "${field}.sequence": expected positive integer.`);
    }

    return {
        id: readString(source.id, `${field}.id`),
        sequence,
        title: readString(source.title, `${field}.title`),
        goalMarkdown: readString(source.goalMarkdown, `${field}.goalMarkdown`),
        exitCriteriaMarkdown: readString(source.exitCriteriaMarkdown, `${field}.exitCriteriaMarkdown`),
    };
}

function parsePlanAdvancedSnapshotInput(input: unknown): PlanAdvancedSnapshotInput {
    const source = readObject(input, 'advancedSnapshot');
    const phases = readArray(source.phases, 'advancedSnapshot.phases');

    return {
        evidenceMarkdown: readString(source.evidenceMarkdown, 'advancedSnapshot.evidenceMarkdown'),
        observationsMarkdown: readString(source.observationsMarkdown, 'advancedSnapshot.observationsMarkdown'),
        rootCauseMarkdown: readString(source.rootCauseMarkdown, 'advancedSnapshot.rootCauseMarkdown'),
        phases: phases.map((phase, index) => parsePlanPhaseOutlineInput(phase, `advancedSnapshot.phases[${String(index)}]`)),
    };
}

function parsePlanPhaseDraftItemInput(input: unknown, field: string): PlanPhaseDraftItemInput {
    const source = readObject(input, field);
    return {
        description: readString(source.description, `${field}.description`),
    };
}

function parsePlanPhaseVerificationDiscrepancyInput(
    input: unknown,
    field: string
): PlanPhaseVerificationDiscrepancyInput {
    const source = readObject(input, field);
    return {
        title: readString(source.title, `${field}.title`),
        detailsMarkdown: readString(source.detailsMarkdown, `${field}.detailsMarkdown`),
    };
}

function parsePlanPhaseVerificationDiscrepancyView(
    input: unknown,
    field: string
): PlanPhaseVerificationDiscrepancyView {
    const source = readObject(input, field);
    return {
        id: readString(source.id, `${field}.id`),
        sequence: readPositiveInteger(source.sequence, `${field}.sequence`),
        title: readString(source.title, `${field}.title`),
        detailsMarkdown: readString(source.detailsMarkdown, `${field}.detailsMarkdown`),
        createdAt: readString(source.createdAt, `${field}.createdAt`),
    };
}

function parsePlanPhaseVerificationView(input: unknown, field: string): PlanPhaseVerificationView {
    const source = readObject(input, field);
    const discrepancies = readArray(source.discrepancies, `${field}.discrepancies`);
    return {
        id: readString(source.id, `${field}.id`),
        planPhaseId: readString(source.planPhaseId, `${field}.planPhaseId`),
        planPhaseRevisionId: readString(source.planPhaseRevisionId, `${field}.planPhaseRevisionId`),
        outcome: readEnumValue(source.outcome, `${field}.outcome`, ['passed', 'failed'] as const),
        summaryMarkdown: readString(source.summaryMarkdown, `${field}.summaryMarkdown`),
        discrepancies: discrepancies.map((entry, index) =>
            parsePlanPhaseVerificationDiscrepancyView(entry, `${field}.discrepancies[${String(index)}]`)
        ),
        createdAt: readString(source.createdAt, `${field}.createdAt`),
    };
}

function parsePlanPhaseRevisionItemView(input: unknown, field: string): PlanPhaseRevisionItemView {
    const source = readObject(input, field);
    return {
        id: readString(source.id, `${field}.id`),
        sequence: readPositiveInteger(source.sequence, `${field}.sequence`),
        description: readString(source.description, `${field}.description`),
        status: readEnumValue(source.status, `${field}.status`, ['pending', 'running', 'completed', 'failed', 'aborted'] as const),
        createdAt: readString(source.createdAt, `${field}.createdAt`),
    };
}

function parsePlanPhaseRevisionView(input: unknown, field = 'input'): PlanPhaseRevisionView {
    const source = readObject(input, field);
    const items = readArray(source.items, `${field}.items`);
    const createdByKind = readEnumValue(source.createdByKind, `${field}.createdByKind`, ['expand', 'revise', 'replan'] as const);
    const previousRevisionId = readOptionalString(source.previousRevisionId, `${field}.previousRevisionId`);
    const sourceVerificationId = readOptionalString(source.sourceVerificationId, `${field}.sourceVerificationId`);
    const supersededAt = readOptionalString(source.supersededAt, `${field}.supersededAt`);

    return {
        id: readString(source.id, `${field}.id`),
        planPhaseId: readString(source.planPhaseId, `${field}.planPhaseId`),
        revisionNumber: readPositiveInteger(source.revisionNumber, `${field}.revisionNumber`),
        summaryMarkdown: readString(source.summaryMarkdown, `${field}.summaryMarkdown`),
        items: items.map((item, index) => parsePlanPhaseRevisionItemView(item, `${field}.items[${String(index)}]`)),
        createdByKind,
        createdAt: readString(source.createdAt, `${field}.createdAt`),
        ...(previousRevisionId ? { previousRevisionId } : {}),
        ...(sourceVerificationId ? { sourceVerificationId } : {}),
        ...(supersededAt ? { supersededAt } : {}),
    };
}

function parsePlanPhaseRecordView(input: unknown): PlanPhaseRecordView {
    const source = readObject(input, 'input');
    const status = readEnumValue(source.status, 'status', ['not_started', 'draft', 'approved', 'implementing', 'implemented', 'cancelled'] as const);
    const approvedRevisionId = readOptionalString(source.approvedRevisionId, 'approvedRevisionId');
    const approvedRevisionNumber = readOptionalNumber(source.approvedRevisionNumber, 'approvedRevisionNumber');
    const implementedRevisionId = readOptionalString(source.implementedRevisionId, 'implementedRevisionId');
    const implementedRevisionNumber = readOptionalNumber(source.implementedRevisionNumber, 'implementedRevisionNumber');
    const implementationRunId = readOptionalString(source.implementationRunId, 'implementationRunId');
    const orchestratorRunId = readOptionalString(source.orchestratorRunId, 'orchestratorRunId');
    const latestVerification = source.latestVerification
        ? parsePlanPhaseVerificationView(source.latestVerification, 'latestVerification')
        : undefined;
    const verifications = readArray(source.verifications, 'verifications');

    return {
        id: readString(source.id, 'id'),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        planRevisionId: readEntityId(source.planRevisionId, 'planRevisionId', 'prev'),
        variantId: readEntityId(source.variantId, 'variantId', 'pvar'),
        phaseOutlineId: readString(source.phaseOutlineId, 'phaseOutlineId'),
        phaseSequence: readPositiveInteger(source.phaseSequence, 'phaseSequence'),
        title: readString(source.title, 'title'),
        goalMarkdown: readString(source.goalMarkdown, 'goalMarkdown'),
        exitCriteriaMarkdown: readString(source.exitCriteriaMarkdown, 'exitCriteriaMarkdown'),
        status,
        currentRevisionId: readString(source.currentRevisionId, 'currentRevisionId'),
        currentRevisionNumber: readPositiveInteger(source.currentRevisionNumber, 'currentRevisionNumber'),
        ...(approvedRevisionId ? { approvedRevisionId } : {}),
        ...(approvedRevisionNumber !== undefined ? { approvedRevisionNumber } : {}),
        ...(implementedRevisionId ? { implementedRevisionId } : {}),
        ...(implementedRevisionNumber !== undefined ? { implementedRevisionNumber } : {}),
        summaryMarkdown: readString(source.summaryMarkdown, 'summaryMarkdown'),
        items: readArray(source.items, 'items').map((item, index) =>
            parsePlanPhaseRevisionItemView(item, `items[${String(index)}]`)
        ),
        verificationStatus: readEnumValue(source.verificationStatus, 'verificationStatus', ['not_applicable', 'pending', 'passed', 'failed'] as const),
        ...(latestVerification ? { latestVerification } : {}),
        verifications: verifications.map((entry, index) =>
            parsePlanPhaseVerificationView(entry, `verifications[${String(index)}]`)
        ),
        canStartVerification: readBoolean(source.canStartVerification, 'canStartVerification'),
        canStartReplan: readBoolean(source.canStartReplan, 'canStartReplan'),
        createdAt: readString(source.createdAt, 'createdAt'),
        updatedAt: readString(source.updatedAt, 'updatedAt'),
        ...(source.approvedAt !== undefined ? { approvedAt: readString(source.approvedAt, 'approvedAt') } : {}),
        ...(source.implementedAt !== undefined ? { implementedAt: readString(source.implementedAt, 'implementedAt') } : {}),
        ...(implementationRunId ? { implementationRunId: readEntityId(implementationRunId, 'implementationRunId', 'run') } : {}),
        ...(orchestratorRunId ? { orchestratorRunId: readEntityId(orchestratorRunId, 'orchestratorRunId', 'orch') } : {}),
    };
}

export function parsePlanGetInput(input: unknown): PlanGetInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
    };
}

export function parsePlanGetActiveInput(input: unknown): PlanGetActiveInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
    };
}

export function parsePlanAnswerQuestionInput(input: unknown): PlanAnswerQuestionInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        questionId: readString(source.questionId, 'questionId'),
        answer: readString(source.answer, 'answer'),
    };
}

export function parsePlanReviseInput(input: unknown): PlanReviseInput {
    const source = readObject(input, 'input');
    const itemsSource = source.items;
    if (!Array.isArray(itemsSource)) {
        throw new Error('Invalid "items": expected array.');
    }

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        summaryMarkdown: readString(source.summaryMarkdown, 'summaryMarkdown'),
        items: itemsSource.map((item, index) => {
            const itemSource = readObject(item, `items[${String(index)}]`);
            return {
                description: readString(itemSource.description, `items[${String(index)}].description`),
            };
        }),
        ...(source.advancedSnapshot ? { advancedSnapshot: parsePlanAdvancedSnapshotInput(source.advancedSnapshot) } : {}),
    };
}

export function parsePlanExpandNextPhaseInput(input: unknown): PlanExpandNextPhaseInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
    };
}

export function parsePlanRevisePhaseInput(input: unknown): PlanRevisePhaseInput {
    const source = readObject(input, 'input');
    const itemsSource = source.items;
    if (!Array.isArray(itemsSource)) {
        throw new Error('Invalid "items": expected array.');
    }

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        phaseId: readString(source.phaseId, 'phaseId'),
        phaseRevisionId: readString(source.phaseRevisionId, 'phaseRevisionId'),
        summaryMarkdown: readString(source.summaryMarkdown, 'summaryMarkdown'),
        items: itemsSource.map((item, index) => parsePlanPhaseDraftItemInput(item, `items[${String(index)}]`)),
    };
}

export function parsePlanApprovePhaseInput(input: unknown): PlanApprovePhaseInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        phaseId: readString(source.phaseId, 'phaseId'),
        phaseRevisionId: readString(source.phaseRevisionId, 'phaseRevisionId'),
    };
}

export function parsePlanImplementPhaseInput(input: unknown): PlanImplementPhaseInput {
    const source = readObject(input, 'input');
    const providerId = source.providerId !== undefined ? readProviderId(source.providerId, 'providerId') : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const executionStrategy =
        source.executionStrategy !== undefined
            ? readOrchestratorExecutionStrategy(source.executionStrategy)
            : undefined;

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        phaseId: readString(source.phaseId, 'phaseId'),
        phaseRevisionId: readString(source.phaseRevisionId, 'phaseRevisionId'),
        runtimeOptions: parseRuntimeRunOptions(source.runtimeOptions),
        ...(executionStrategy ? { executionStrategy } : {}),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parsePlanCancelPhaseInput(input: unknown): PlanCancelPhaseInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        phaseId: readString(source.phaseId, 'phaseId'),
    };
}

export function parsePlanVerifyPhaseInput(input: unknown): PlanVerifyPhaseInput {
    const source = readObject(input, 'input');
    const discrepancies = readArray(source.discrepancies, 'discrepancies');
    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        phaseId: readString(source.phaseId, 'phaseId'),
        phaseRevisionId: readString(source.phaseRevisionId, 'phaseRevisionId'),
        outcome: readEnumValue(source.outcome, 'outcome', ['passed', 'failed'] as const),
        summaryMarkdown: readString(source.summaryMarkdown, 'summaryMarkdown'),
        discrepancies: discrepancies.map((entry, index) =>
            parsePlanPhaseVerificationDiscrepancyInput(entry, `discrepancies[${String(index)}]`)
        ),
    };
}

export function parsePlanStartPhaseReplanInput(input: unknown): PlanStartPhaseReplanInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        phaseId: readString(source.phaseId, 'phaseId'),
        verificationId: readString(source.verificationId, 'verificationId'),
    };
}

export function parsePlanEnterAdvancedPlanningInput(input: unknown): PlanEnterAdvancedPlanningInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
    };
}

export function parsePlanCreateVariantInput(input: unknown): PlanCreateVariantInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        sourceRevisionId: readEntityId(source.sourceRevisionId, 'sourceRevisionId', 'prev'),
    };
}

export function parsePlanActivateVariantInput(input: unknown): PlanActivateVariantInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        variantId: readEntityId(source.variantId, 'variantId', 'pvar'),
    };
}

export function parsePlanResumeFromRevisionInput(input: unknown): PlanResumeFromRevisionInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        sourceRevisionId: readEntityId(source.sourceRevisionId, 'sourceRevisionId', 'prev'),
        ...(source.variantId ? { variantId: readEntityId(source.variantId, 'variantId', 'pvar') } : {}),
    };
}

export function parsePlanRaiseFollowUpInput(input: unknown): PlanRaiseFollowUpInput {
    const source = readObject(input, 'input');
    const kind = readEnumValue(source.kind, 'kind', ['missing_context', 'missing_file'] as const);

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        kind,
        promptMarkdown: readString(source.promptMarkdown, 'promptMarkdown'),
        ...(source.sourceRevisionId ? { sourceRevisionId: readEntityId(source.sourceRevisionId, 'sourceRevisionId', 'prev') } : {}),
    };
}

export function parsePlanResolveFollowUpInput(input: unknown): PlanResolveFollowUpInput {
    const source = readObject(input, 'input');
    const status = readEnumValue(source.status, 'status', ['resolved', 'dismissed'] as const);

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        followUpId: readEntityId(source.followUpId, 'followUpId', 'pfu'),
        status,
        ...(source.responseMarkdown ? { responseMarkdown: readString(source.responseMarkdown, 'responseMarkdown') } : {}),
    };
}

export function parsePlanApproveInput(input: unknown): PlanApproveInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        revisionId: readEntityId(source.revisionId, 'revisionId', 'prev'),
    };
}

export function parsePlanImplementInput(input: unknown): PlanImplementInput {
    const source = readObject(input, 'input');
    const providerId = source.providerId !== undefined ? readProviderId(source.providerId, 'providerId') : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const executionStrategy =
        source.executionStrategy !== undefined
            ? readOrchestratorExecutionStrategy(source.executionStrategy)
            : undefined;

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        runtimeOptions: parseRuntimeRunOptions(source.runtimeOptions),
        ...(executionStrategy ? { executionStrategy } : {}),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parsePlanGenerateDraftInput(input: unknown): PlanGenerateDraftInput {
    const source = readObject(input, 'input');
    const providerId = source.providerId !== undefined ? readProviderId(source.providerId, 'providerId') : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
        runtimeOptions: parseRuntimeRunOptions(source.runtimeOptions),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parsePlanCancelInput(input: unknown): PlanCancelInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        planId: readEntityId(source.planId, 'planId', 'plan'),
    };
}

export const planStartInputSchema = createParser(parsePlanStartInput);
export const planStartResearchBatchInputSchema = createParser(parsePlanStartResearchBatchInput);
export const planAbortResearchBatchInputSchema = createParser(parsePlanAbortResearchBatchInput);
export const planGetInputSchema = createParser(parsePlanGetInput);
export const planGetActiveInputSchema = createParser(parsePlanGetActiveInput);
export const planAnswerQuestionInputSchema = createParser(parsePlanAnswerQuestionInput);
export const planReviseInputSchema = createParser(parsePlanReviseInput);
export const planExpandNextPhaseInputSchema = createParser(parsePlanExpandNextPhaseInput);
export const planRevisePhaseInputSchema = createParser(parsePlanRevisePhaseInput);
export const planApprovePhaseInputSchema = createParser(parsePlanApprovePhaseInput);
export const planImplementPhaseInputSchema = createParser(parsePlanImplementPhaseInput);
export const planCancelPhaseInputSchema = createParser(parsePlanCancelPhaseInput);
export const planVerifyPhaseInputSchema = createParser(parsePlanVerifyPhaseInput);
export const planStartPhaseReplanInputSchema = createParser(parsePlanStartPhaseReplanInput);
export const planEnterAdvancedPlanningInputSchema = createParser(parsePlanEnterAdvancedPlanningInput);
export const planCreateVariantInputSchema = createParser(parsePlanCreateVariantInput);
export const planActivateVariantInputSchema = createParser(parsePlanActivateVariantInput);
export const planResumeFromRevisionInputSchema = createParser(parsePlanResumeFromRevisionInput);
export const planRaiseFollowUpInputSchema = createParser(parsePlanRaiseFollowUpInput);
export const planResolveFollowUpInputSchema = createParser(parsePlanResolveFollowUpInput);
export const planApproveInputSchema = createParser(parsePlanApproveInput);
export const planGenerateDraftInputSchema = createParser(parsePlanGenerateDraftInput);
export const planCancelInputSchema = createParser(parsePlanCancelInput);
export const planImplementInputSchema = createParser(parsePlanImplementInput);
export const planPhaseRecordViewSchema = createParser(parsePlanPhaseRecordView);
export const planPhaseRevisionViewSchema = createParser((input) => parsePlanPhaseRevisionView(input));
