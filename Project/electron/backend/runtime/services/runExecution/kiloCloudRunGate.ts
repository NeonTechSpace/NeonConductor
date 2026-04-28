import { cloudSessionStore, threadStore } from '@/app/backend/persistence/stores';
import type { CloudSessionSummaryRecord } from '@/app/backend/persistence/types';
import { getKiloCloudRemoteClient } from '@/app/backend/providers/cloudSessions/kiloCloudRemoteClient';
import { resolveKiloCloudSessionAccessContext } from '@/app/backend/providers/cloudSessions/kiloCloudSessionPrerequisites';
import type { RunExecutionError } from '@/app/backend/runtime/services/runExecution/errors';
import type { StartRunInput } from '@/app/backend/runtime/services/runExecution/types';

interface KiloCloudRunGateSuccess {
    cloudSession: CloudSessionSummaryRecord;
}

type KiloCloudRunGateResult =
    | {
          ok: true;
          value: KiloCloudRunGateSuccess;
      }
    | {
          ok: false;
          error: RunExecutionError;
      };

function contractUnavailableError(input: {
    sessionId: string;
    message: string;
    detail: NonNullable<
        Extract<RunExecutionError['action'], { code: 'cloud_session_contract_unavailable' }>['detail']
    >;
}): RunExecutionError {
    return {
        code: 'cloud_session_contract_unavailable',
        message: input.message,
        action: {
            code: 'cloud_session_contract_unavailable',
            sessionId: input.sessionId,
            detail: input.detail,
        },
    };
}

export async function resolveKiloCloudRunGate(input: StartRunInput): Promise<KiloCloudRunGateResult> {
    const [thread, cloudSession] = await Promise.all([
        threadStore.getBySessionId(input.profileId, input.sessionId),
        cloudSessionStore.getBySessionId(input.profileId, input.sessionId),
    ]);

    if (!thread) {
        return {
            ok: false,
            error: {
                code: 'invalid_payload',
                message: 'Session thread could not be found for Kilo Cloud run.',
            },
        };
    }

    if (thread.thread.topLevelTab !== input.topLevelTab) {
        return {
            ok: false,
            error: {
                code: 'invalid_mode',
                message: `Thread mode "${thread.thread.topLevelTab}" does not match tab "${input.topLevelTab}".`,
                action: {
                    code: 'mode_invalid',
                    modeKey: input.modeKey,
                    topLevelTab: input.topLevelTab,
                },
            },
        };
    }

    if (!cloudSession || cloudSession.recordKind !== 'local_binding' || cloudSession.authorityState === 'forked') {
        return {
            ok: false,
            error: contractUnavailableError({
                sessionId: input.sessionId,
                detail: 'binding_missing',
                message: 'This cloud session does not have an eligible Kilo Cloud local binding.',
            }),
        };
    }

    const accessContext = await resolveKiloCloudSessionAccessContext(input.profileId);
    if (accessContext.isErr()) {
        return {
            ok: false,
            error: contractUnavailableError({
                sessionId: input.sessionId,
                detail: 'auth_required',
                message: accessContext.error.message,
            }),
        };
    }

    if (cloudSession.remoteScopeKey !== accessContext.value.scope.remoteScopeKey) {
        return {
            ok: false,
            error: contractUnavailableError({
                sessionId: input.sessionId,
                detail: 'scope_mismatch',
                message: 'This cloud session belongs to a different Kilo account or organization scope.',
            }),
        };
    }

    const availability = getKiloCloudRemoteClient().getAvailability();
    if (!availability.available) {
        return {
            ok: false,
            error: contractUnavailableError({
                sessionId: input.sessionId,
                detail: 'kilo_harness_contract_missing',
                message: availability.error.message,
            }),
        };
    }

    return {
        ok: true,
        value: {
            cloudSession,
        },
    };
}
