import { threadStore } from '@/app/backend/persistence/stores';
import { prepareRunContractPreview } from '@/app/backend/runtime/services/runContract/service';
import { prepareRunStart } from '@/app/backend/runtime/services/runExecution/prepareRunStart';
import type { StartRunInput } from '@/app/backend/runtime/services/runExecution/types';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

import type { RunContractPreview } from '@/shared/contracts';

export async function previewRunContractForStart(
    input: StartRunInput,
    previousCompatibleContract?: RunContractPreview
) {
    const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
    if (!sessionThread) {
        return {
            available: false as const,
            reason: 'rejected' as const,
            code: 'not_found',
            message: 'Session thread could not be found for run preview.',
        };
    }
    if (sessionThread.thread.topLevelTab !== input.topLevelTab) {
        const message = `Thread mode "${sessionThread.thread.topLevelTab}" does not match tab "${input.topLevelTab}".`;
        return {
            available: false as const,
            reason: 'rejected' as const,
            code: 'invalid_mode',
            message,
            action: {
                code: 'mode_invalid',
                modeKey: input.modeKey,
                topLevelTab: input.topLevelTab,
            },
        };
    }

    const workspaceContext = await workspaceContextService.resolveForSession({
        profileId: input.profileId,
        sessionId: input.sessionId,
        topLevelTab: input.topLevelTab,
        allowLazySandboxCreation: false,
    });
    if (!workspaceContext) {
        return {
            available: false as const,
            reason: 'rejected' as const,
            code: 'execution_target_unavailable',
            message: 'Workspace execution target could not be resolved for this session.',
            action: {
                code: 'execution_target_unavailable',
                target: 'workspace',
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                detail: 'workspace_not_resolved',
            },
        };
    }
    if (input.topLevelTab !== 'chat' && workspaceContext.kind === 'workspace_unresolved') {
        return {
            available: false as const,
            reason: 'rejected' as const,
            code: 'execution_target_unavailable',
            message: 'Workspace root is unresolved for this session.',
            action: {
                code: 'execution_target_unavailable',
                target: 'workspace',
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                detail: 'workspace_root_missing',
            },
        };
    }

    const preparedResult = await prepareRunStart({
        ...input,
        ...(workspaceContext.kind === 'sandbox' ? { sandboxId: workspaceContext.sandbox.id } : {}),
        workspaceContext,
    });
    if (preparedResult.isErr()) {
        return {
            available: false as const,
            reason: 'rejected' as const,
            code: preparedResult.error.code,
            message: preparedResult.error.message,
            ...(preparedResult.error.action ? { action: preparedResult.error.action } : {}),
        };
    }

    const preview = prepareRunContractPreview({
        startInput: input,
        prepared: preparedResult.value,
        ...(previousCompatibleContract ? { previousCompatibleContract } : {}),
    });
    if (!preview) {
        return {
            available: false as const,
            reason: 'rejected' as const,
            code: 'provider_request_failed',
            message: 'Run contract preview is unavailable because the prepared context could not be resolved.',
        };
    }

    return {
        available: true as const,
        preview,
    };
}
