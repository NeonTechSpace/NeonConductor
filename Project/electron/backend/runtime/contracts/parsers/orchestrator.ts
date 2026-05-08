import {
    orchestratorExecutionStrategies,
    orchestratorLazyCapabilityGroups,
    orchestratorLazyCheckpointStatuses,
    orchestratorLazyPackagePolicies,
    orchestratorLazyResearchDepths,
} from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    parseRuntimeRunOptions,
    readArray,
    readEntityId,
    readEnumValue,
    readObject,
    readOptionalString,
    readProfileId,
    readProviderId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type { OrchestratorExecutionStrategy } from '@/app/backend/runtime/contracts/enums';
import type {
    OrchestratorLazyCheckpointResolutionInput,
    OrchestratorLazyStartInput,
    OrchestratorRunByIdInput,
    OrchestratorRunBySessionInput,
    OrchestratorStartInput,
} from '@/app/backend/runtime/contracts/types';

function readOrchestratorExecutionStrategy(value: unknown): OrchestratorExecutionStrategy {
    if (value === 'delegate') {
        return 'sequential';
    }

    return readEnumValue(value, 'executionStrategy', orchestratorExecutionStrategies);
}

export function parseOrchestratorStartInput(input: unknown): OrchestratorStartInput {
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

export function parseOrchestratorLazyStartInput(input: unknown): OrchestratorLazyStartInput {
    const source = readObject(input, 'input');
    const providerId = source.providerId !== undefined ? readProviderId(source.providerId, 'providerId') : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const successCriteriaMarkdown = readOptionalString(source.successCriteriaMarkdown, 'successCriteriaMarkdown');
    const constraintsMarkdown = readOptionalString(source.constraintsMarkdown, 'constraintsMarkdown');
    const evidenceRequirementsMarkdown = readOptionalString(
        source.evidenceRequirementsMarkdown,
        'evidenceRequirementsMarkdown'
    );
    const allowedCapabilityGroups = readArray(source.allowedCapabilityGroups, 'allowedCapabilityGroups').map(
        (value, index) =>
            readEnumValue(
                value,
                `allowedCapabilityGroups[${String(index)}]`,
                orchestratorLazyCapabilityGroups
            )
    );

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        objectiveMarkdown: readString(source.objectiveMarkdown, 'objectiveMarkdown'),
        ...(successCriteriaMarkdown ? { successCriteriaMarkdown } : {}),
        ...(constraintsMarkdown ? { constraintsMarkdown } : {}),
        ...(evidenceRequirementsMarkdown ? { evidenceRequirementsMarkdown } : {}),
        allowedCapabilityGroups,
        researchDepth: readEnumValue(source.researchDepth, 'researchDepth', orchestratorLazyResearchDepths),
        packagePolicy: readEnumValue(source.packagePolicy, 'packagePolicy', orchestratorLazyPackagePolicies),
        runtimeOptions: parseRuntimeRunOptions(source.runtimeOptions),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parseOrchestratorLazyCheckpointResolutionInput(
    input: unknown
): OrchestratorLazyCheckpointResolutionInput {
    const source = readObject(input, 'input');
    const status = readEnumValue(source.status, 'status', orchestratorLazyCheckpointStatuses);
    const responseMarkdown = readOptionalString(source.responseMarkdown, 'responseMarkdown');
    if (status !== 'resolved' && status !== 'cancelled') {
        throw new Error('Invalid "status": expected resolved or cancelled.');
    }

    return {
        profileId: readProfileId(source),
        checkpointId: readEntityId(source.checkpointId, 'checkpointId', 'lchk'),
        status,
        ...(responseMarkdown ? { responseMarkdown } : {}),
    };
}

export function parseOrchestratorRunByIdInput(input: unknown): OrchestratorRunByIdInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        orchestratorRunId: readEntityId(source.orchestratorRunId, 'orchestratorRunId', 'orch'),
    };
}

export function parseOrchestratorRunBySessionInput(input: unknown): OrchestratorRunBySessionInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
    };
}

export const orchestratorStartInputSchema = createParser(parseOrchestratorStartInput);
export const orchestratorLazyStartInputSchema = createParser(parseOrchestratorLazyStartInput);
export const orchestratorLazyCheckpointResolutionInputSchema = createParser(
    parseOrchestratorLazyCheckpointResolutionInput
);
export const orchestratorRunByIdInputSchema = createParser(parseOrchestratorRunByIdInput);
export const orchestratorRunBySessionInputSchema = createParser(parseOrchestratorRunBySessionInput);
