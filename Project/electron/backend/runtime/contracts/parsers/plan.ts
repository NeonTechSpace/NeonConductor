import { orchestratorExecutionStrategies, topLevelTabs } from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    parseRuntimeRunOptions,
    readEntityId,
    readEnumValue,
    readObject,
    readOptionalString,
    readProfileId,
    readProviderId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    PlanAnswerQuestionInput,
    PlanApproveInput,
    PlanCancelInput,
    PlanGenerateDraftInput,
    PlanGetActiveInput,
    PlanGetInput,
    PlanImplementInput,
    PlanReviseInput,
    PlanStartInput,
} from '@/app/backend/runtime/contracts/types';

export function parsePlanStartInput(input: unknown): PlanStartInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');

    return {
        profileId: readProfileId(source),
        sessionId: readEntityId(source.sessionId, 'sessionId', 'sess'),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        prompt: readString(source.prompt, 'prompt'),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
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
            ? readEnumValue(source.executionStrategy, 'executionStrategy', orchestratorExecutionStrategies)
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
export const planGetInputSchema = createParser(parsePlanGetInput);
export const planGetActiveInputSchema = createParser(parsePlanGetActiveInput);
export const planAnswerQuestionInputSchema = createParser(parsePlanAnswerQuestionInput);
export const planReviseInputSchema = createParser(parsePlanReviseInput);
export const planApproveInputSchema = createParser(parsePlanApproveInput);
export const planGenerateDraftInputSchema = createParser(parsePlanGenerateDraftInput);
export const planCancelInputSchema = createParser(parsePlanCancelInput);
export const planImplementInputSchema = createParser(parsePlanImplementInput);
