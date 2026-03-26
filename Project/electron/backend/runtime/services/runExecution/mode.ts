import { resolveModesForTab } from '@/app/backend/runtime/services/registry/service';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';

import type { ModeDefinition, TopLevelTab } from '@/shared/contracts';

interface ResolveModeExecutionInput {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
}

export interface ResolvedModeExecution {
    mode: ModeDefinition;
}

export async function resolveModeExecution(
    input: ResolveModeExecutionInput
): Promise<RunExecutionResult<ResolvedModeExecution>> {
    const modes = await resolveModesForTab(input);
    const mode = modes.find((candidate) => candidate.modeKey === input.modeKey);
    if (!mode) {
        if (input.topLevelTab !== 'agent') {
            return errRunExecution(
                'invalid_mode',
                `Mode "${input.modeKey}" is invalid for tab "${input.topLevelTab}".`
            );
        }

        return errRunExecution(
            'mode_not_available',
            `Mode "${input.modeKey}" is not available for tab "${input.topLevelTab}".`
        );
    }

    if (mode.executionPolicy.planningOnly) {
        return errRunExecution(
            'mode_policy_invalid',
            `Mode "${input.modeKey}" is planning-only and cannot execute runs.`
        );
    }

    return okRunExecution({ mode });
}

