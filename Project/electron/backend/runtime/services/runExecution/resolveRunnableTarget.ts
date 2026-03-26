import { providerStore } from '@/app/backend/persistence/stores';
import { prepareRunnableCandidate } from '@/app/backend/runtime/services/runExecution/compatibility';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { PreparedRunnableCandidate, ResolvedRunTarget } from '@/app/backend/runtime/services/runExecution/types';

import type {
    ComposerImageAttachmentInput,
    ModeDefinition,
    RuntimeRunOptions,
    TopLevelTab,
} from '@/shared/contracts';
import { providerIds } from '@/shared/contracts';

interface ResolveRunnableRunTargetInput {
    profileId: string;
    topLevelTab: TopLevelTab;
    mode: ModeDefinition;
    runtimeOptions: RuntimeRunOptions;
    attachments?: ComposerImageAttachmentInput[];
    preferredTarget?: ResolvedRunTarget;
}

async function* enumerateRunTargetCandidates(input: ResolveRunnableRunTargetInput): AsyncGenerator<ResolvedRunTarget> {
    if (input.preferredTarget) {
        yield input.preferredTarget;
    }

    for (const providerId of providerIds) {
        const models = await providerStore.listModels(input.profileId, providerId);
        for (const model of models) {
            if (
                input.preferredTarget &&
                input.preferredTarget.providerId === providerId &&
                input.preferredTarget.modelId === model.id
            ) {
                continue;
            }

            yield {
                providerId,
                modelId: model.id,
            };
        }
    }
}

export async function resolveFirstRunnableRunTarget(
    input: ResolveRunnableRunTargetInput
): Promise<RunExecutionResult<PreparedRunnableCandidate | null>> {
    for await (const candidateTarget of enumerateRunTargetCandidates(input)) {
        const preparedCandidateResult = await prepareRunnableCandidate({
            profileId: input.profileId,
            providerId: candidateTarget.providerId,
            modelId: candidateTarget.modelId,
            topLevelTab: input.topLevelTab,
            mode: input.mode,
            runtimeOptions: input.runtimeOptions,
            ...(input.attachments ? { attachments: input.attachments } : {}),
        });
        if (preparedCandidateResult.isErr()) {
            return errRunExecution(preparedCandidateResult.error.code, preparedCandidateResult.error.message, {
                ...(preparedCandidateResult.error.action ? { action: preparedCandidateResult.error.action } : {}),
            });
        }

        if (preparedCandidateResult.value.kind === 'prepared') {
            return okRunExecution(preparedCandidateResult.value.candidate);
        }
    }

    return okRunExecution(null);
}

