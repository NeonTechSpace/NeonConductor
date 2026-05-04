import { researchCheckoutService } from '@/app/backend/runtime/services/researchCheckouts/service';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { StartRunInput } from '@/app/backend/runtime/services/runExecution/types';

import type { RunResearchTarget } from '@/shared/contracts';

export async function resolveResearchTargetForRun(input: {
    startInput: StartRunInput;
    requireExistingCheckout: boolean;
}): Promise<RunExecutionResult<RunResearchTarget | undefined>> {
    if (!input.startInput.researchTarget) {
        return okRunExecution(undefined);
    }

    if (input.startInput.topLevelTab !== 'agent' || input.startInput.modeKey !== 'research') {
        return errRunExecution('invalid_mode', 'Repo-research targets are only allowed for agent.research runs.', {
            action: {
                code: 'mode_invalid',
                modeKey: input.startInput.modeKey,
                topLevelTab: input.startInput.topLevelTab,
            },
        });
    }

    const previewResult = await researchCheckoutService.previewResearchTarget({
        profileId: input.startInput.profileId,
        sessionId: input.startInput.sessionId,
        ...(input.startInput.workspaceFingerprint
            ? { workspaceFingerprint: input.startInput.workspaceFingerprint }
            : {}),
        target: input.startInput.researchTarget,
    });
    if (previewResult.isErr()) {
        return errRunExecution(
            previewResult.error.code === 'not_found' ? 'execution_target_unavailable' : 'invalid_payload',
            previewResult.error.message,
            {
                action: {
                    code: 'execution_target_unavailable',
                    target: 'research_checkout',
                    detail: previewResult.error.code,
                },
            }
        );
    }

    const researchTarget = previewResult.value.researchTarget;
    if (researchTarget.mutationGuardrail.outcome === 'blocked') {
        return errRunExecution('mode_policy_invalid', researchTarget.mutationGuardrail.reason, {
            action: {
                code: 'runtime_options_invalid',
                modeKey: input.startInput.modeKey,
                detail: 'generic',
            },
        });
    }
    if (input.requireExistingCheckout && researchTarget.mutationGuardrail.intent !== 'inspect') {
        return errRunExecution(
            'mode_policy_invalid',
            'Repo-research mutation intents require an explicit guarded runtime action.',
            {
                action: {
                    code: 'runtime_options_invalid',
                    modeKey: input.startInput.modeKey,
                    detail: 'generic',
                },
            }
        );
    }

    if (input.requireExistingCheckout && researchTarget.checkoutAction === 'clone_required') {
        return errRunExecution(
            'execution_target_unavailable',
            'Repo-research checkout is not present; clone planning is reported but automatic clone is not enabled in this slice.',
            {
                action: {
                    code: 'execution_target_unavailable',
                    target: 'research_checkout',
                    detail: 'checkout_missing',
                },
            }
        );
    }

    return okRunExecution(researchTarget);
}
