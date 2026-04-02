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
    PlanActivateVariantInput,
    PlanAnswerQuestionInput,
    PlanApproveInput,
    PlanCancelInput,
    PlanCreateVariantInput,
    PlanGenerateDraftInput,
    PlanGetActiveInput,
    PlanGetInput,
    PlanImplementInput,
    PlanRaiseFollowUpInput,
    PlanReviseInput,
    PlanResolveFollowUpInput,
    PlanResumeFromRevisionInput,
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
export const planCreateVariantInputSchema = createParser(parsePlanCreateVariantInput);
export const planActivateVariantInputSchema = createParser(parsePlanActivateVariantInput);
export const planResumeFromRevisionInputSchema = createParser(parsePlanResumeFromRevisionInput);
export const planRaiseFollowUpInputSchema = createParser(parsePlanRaiseFollowUpInput);
export const planResolveFollowUpInputSchema = createParser(parsePlanResolveFollowUpInput);
export const planApproveInputSchema = createParser(parsePlanApproveInput);
export const planGenerateDraftInputSchema = createParser(parsePlanGenerateDraftInput);
export const planCancelInputSchema = createParser(parsePlanCancelInput);
export const planImplementInputSchema = createParser(parsePlanImplementInput);
