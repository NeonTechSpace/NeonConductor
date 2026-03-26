import { getPersistence, reseedRuntimeData } from '@/app/backend/persistence/db';
import type { RuntimeResetInput, RuntimeResetResult } from '@/app/backend/runtime/contracts';
import {
    errOp,
    okOp,
    toOperationalError,
    type OperationalResult,
} from '@/app/backend/runtime/services/common/operationalError';
import { planFullReset } from '@/app/backend/runtime/services/runtimeReset/full';
import { planProfileSettingsReset } from '@/app/backend/runtime/services/runtimeReset/profileSettings';
import type { PlannedRuntimeResetOperation } from '@/app/backend/runtime/services/runtimeReset/types';
import { planWorkspaceReset } from '@/app/backend/runtime/services/runtimeReset/workspace';
import { appLog } from '@/app/main/logging';

export interface RuntimeResetService {
    reset(input: RuntimeResetInput): Promise<OperationalResult<RuntimeResetResult>>;
}

class RuntimeResetServiceImpl implements RuntimeResetService {
    async reset(input: RuntimeResetInput): Promise<OperationalResult<RuntimeResetResult>> {
        const startedAt = Date.now();
        appLog.info({
            tag: 'runtime.reset',
            message: 'Runtime reset requested.',
            target: input.target,
            dryRun: input.dryRun ?? false,
            ...(input.profileId ? { profileId: input.profileId } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });

        const { db } = getPersistence();
        const dryRun = input.dryRun ?? false;

        try {
            const plan = await this.planReset(db, input);

            if (!dryRun) {
                await plan.apply(db);
                if (plan.reseedRuntimeData) {
                    reseedRuntimeData();
                }
            }

            const result = {
                dryRun,
                target: input.target,
                applied: !dryRun,
                counts: plan.counts,
            } satisfies RuntimeResetResult;

            appLog.info({
                tag: 'runtime.reset',
                message: this.completeMessageForTarget(input.target),
                target: input.target,
                ...(input.profileId ? { profileId: input.profileId } : {}),
                dryRun,
                applied: result.applied,
                durationMs: Date.now() - startedAt,
                counts: plan.counts,
            });

            return okOp(result);
        } catch (error) {
            const operationalError = toOperationalError(error, 'request_failed', 'Runtime reset failed.');
            appLog.error({
                tag: 'runtime.reset',
                message: 'Runtime reset failed.',
                target: input.target,
                dryRun,
                durationMs: Date.now() - startedAt,
                error: operationalError.message,
                code: operationalError.code,
            });
            return errOp(operationalError.code, operationalError.message, {
                ...(operationalError.details ? { details: operationalError.details } : {}),
                ...(operationalError.retryable !== undefined ? { retryable: operationalError.retryable } : {}),
            });
        }
    }

    private async planReset(
        db: ReturnType<typeof getPersistence>['db'],
        input: RuntimeResetInput
    ): Promise<PlannedRuntimeResetOperation> {
        if (input.target === 'workspace' || input.target === 'workspace_all') {
            return planWorkspaceReset(db, input.target, input.workspaceFingerprint);
        }

        if (input.target === 'profile_settings') {
            return planProfileSettingsReset(db, input.profileId ?? '');
        }

        return planFullReset(db);
    }

    private completeMessageForTarget(target: RuntimeResetInput['target']): string {
        if (target === 'workspace' || target === 'workspace_all') {
            return 'Completed workspace runtime reset.';
        }

        if (target === 'profile_settings') {
            return 'Completed profile settings reset.';
        }

        return 'Completed full runtime reset.';
    }
}

export const runtimeResetService: RuntimeResetService = new RuntimeResetServiceImpl();
