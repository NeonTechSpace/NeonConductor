import { createHash } from 'node:crypto';

import { cloudSessionStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import type { CloudSessionSummaryRecord, SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';
import { resolveKiloCloudSessionAccessContext } from '@/app/backend/providers/cloudSessions/kiloCloudSessionPrerequisites';
import { fetchCloudSession } from '@/app/backend/providers/cloudSessions/kiloCloudSessions';
import type {
    SessionContinueCloudSessionInput,
    SessionForkCloudSessionInput,
    SessionImportCloudSessionInput,
    SessionListCloudSessionsInput,
} from '@/app/backend/runtime/contracts';

type CloudSessionActionFailureReason =
    | 'thread_not_found'
    | 'cloud_session_not_found'
    | 'cloud_prerequisites_blocked'
    | 'remote_session_not_found'
    | 'remote_session_unavailable'
    | 'invalid_remote_payload'
    | 'scope_mismatch'
    | 'cloud_binding_failed';

export type CloudSessionActionResult =
    | {
          ok: false;
          reason: CloudSessionActionFailureReason;
          message: string;
      }
    | {
          ok: true;
          session: SessionSummaryRecord;
          cloudSession: CloudSessionSummaryRecord;
          thread?: ThreadListRecord;
          message: string;
      };

interface SanitizedRemoteSessionMetadata {
    title?: string;
    remoteCreatedAt?: string;
    remoteUpdatedAt?: string;
    metadata: Record<string, unknown>;
}

function readStringField(source: Record<string, unknown>, names: string[]): string | undefined {
    for (const name of names) {
        const value = source[name];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return undefined;
}

function readArrayLength(source: Record<string, unknown>, names: string[]): number | undefined {
    for (const name of names) {
        const value = source[name];
        if (Array.isArray(value)) {
            return value.length;
        }
    }
    return undefined;
}

function digestRemotePayload(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function sanitizeRemoteSessionMetadata(payload: Record<string, unknown>): SanitizedRemoteSessionMetadata {
    const title = readStringField(payload, ['title', 'name', 'sessionTitle']);
    const remoteCreatedAt = readStringField(payload, ['createdAt', 'created_at', 'created']);
    const remoteUpdatedAt = readStringField(payload, ['updatedAt', 'updated_at', 'lastUpdatedAt', 'modifiedAt']);
    const messageCount = readArrayLength(payload, ['messages', 'history']);
    const partCount = readArrayLength(payload, ['parts']);

    return {
        ...(title ? { title } : {}),
        ...(remoteCreatedAt ? { remoteCreatedAt } : {}),
        ...(remoteUpdatedAt ? { remoteUpdatedAt } : {}),
        metadata: {
            source: 'kilo_cloud_export',
            payloadDigest: digestRemotePayload(payload),
            ...(messageCount !== undefined ? { messageCount } : {}),
            ...(partCount !== undefined ? { partCount } : {}),
        },
    };
}

function buildScopeMetadata(input: {
    remoteSessionId: string;
    remoteScopeKey: string;
    accountId?: string;
    organizationId?: string;
    title?: string;
    remoteCreatedAt?: string;
    remoteUpdatedAt?: string;
    metadata?: Record<string, unknown>;
}) {
    return {
        remoteSessionId: input.remoteSessionId,
        remoteScopeKey: input.remoteScopeKey,
        ...(input.accountId ? { accountId: input.accountId } : {}),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.remoteCreatedAt ? { remoteCreatedAt: input.remoteCreatedAt } : {}),
        ...(input.remoteUpdatedAt ? { remoteUpdatedAt: input.remoteUpdatedAt } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
    };
}

function resultMessageForCreateFailure(reason: string): CloudSessionActionResult {
    if (reason === 'thread_not_found') {
        return {
            ok: false,
            reason: 'thread_not_found',
            message: 'The selected thread was not found.',
        };
    }
    return {
        ok: false,
        reason: 'cloud_binding_failed',
        message: 'The cloud session binding could not be created.',
    };
}

export class CloudSessionService {
    async list(input: SessionListCloudSessionsInput): Promise<{ cloudSessions: CloudSessionSummaryRecord[] }> {
        const accessContext =
            input.scopeMode === 'all' ? undefined : await resolveKiloCloudSessionAccessContext(input.profileId);
        const remoteScopeKey = accessContext?.isOk() ? accessContext.value.scope.remoteScopeKey : undefined;
        const cloudSessions = await cloudSessionStore.list({
            profileId: input.profileId,
            ...(input.query ? { query: input.query } : {}),
            ...(remoteScopeKey ? { remoteScopeKey } : {}),
            ...(input.recordKind && input.recordKind !== 'all' ? { recordKind: input.recordKind } : {}),
            ...(input.authorityState && input.authorityState !== 'all'
                ? { authorityState: input.authorityState }
                : {}),
            ...(input.syncState && input.syncState !== 'all' ? { syncState: input.syncState } : {}),
        });

        return { cloudSessions };
    }

    async importById(input: SessionImportCloudSessionInput): Promise<CloudSessionActionResult> {
        const accessContext = await resolveKiloCloudSessionAccessContext(input.profileId);
        if (accessContext.isErr()) {
            return {
                ok: false,
                reason: 'cloud_prerequisites_blocked',
                message: accessContext.error.message,
            };
        }

        const fetched = await fetchCloudSession(accessContext.value.accessToken, input.remoteSessionId);
        if (!fetched.ok) {
            return {
                ok: false,
                reason: fetched.status === 404 ? 'remote_session_not_found' : 'remote_session_unavailable',
                message: fetched.error ?? 'The remote Kilo cloud session could not be fetched.',
            };
        }
        if (!fetched.data) {
            return {
                ok: false,
                reason: 'invalid_remote_payload',
                message: 'The remote Kilo cloud session payload was invalid.',
            };
        }

        const sanitized = sanitizeRemoteSessionMetadata(fetched.data);
        const scope = accessContext.value.scope;
        const cloudMetadata = buildScopeMetadata({
            remoteSessionId: input.remoteSessionId,
            remoteScopeKey: scope.remoteScopeKey,
            ...(scope.accountId ? { accountId: scope.accountId } : {}),
            ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
            ...sanitized,
        });

        await cloudSessionStore.upsertRemoteSnapshot({
            profileId: input.profileId,
            ...cloudMetadata,
        });

        const created = await sessionStore.create(input.profileId, input.threadId, 'cloud', {
            cloudSession: cloudMetadata,
            cloudSessionAuthorityState: 'imported',
        });
        if (!created.created) {
            return resultMessageForCreateFailure(created.reason);
        }

        const cloudSession = created.session.cloudSession;
        if (!cloudSession) {
            return resultMessageForCreateFailure('cloud_binding_failed');
        }

        return {
            ok: true,
            session: created.session,
            cloudSession,
            ...(await this.readThread(input.profileId, created.session.threadId)),
            message: 'Imported the Kilo cloud session. Remote continuation remains disabled until Slice 7D lands.',
        };
    }

    async fork(input: SessionForkCloudSessionInput): Promise<CloudSessionActionResult> {
        const source = await cloudSessionStore.getById(input.profileId, input.cloudSessionId);
        if (!source) {
            return {
                ok: false,
                reason: 'cloud_session_not_found',
                message: 'The cloud session record was not found.',
            };
        }

        const created = await sessionStore.create(input.profileId, input.threadId, 'local', {
            cloudSession: this.copyCloudMetadata(source, { forkedFromCloudSessionId: source.id }),
            cloudSessionAuthorityState: 'forked',
        });
        if (!created.created) {
            return resultMessageForCreateFailure(created.reason);
        }

        const cloudSession = created.session.cloudSession;
        if (!cloudSession) {
            return resultMessageForCreateFailure('cloud_binding_failed');
        }

        return {
            ok: true,
            session: created.session,
            cloudSession,
            ...(await this.readThread(input.profileId, created.session.threadId)),
            message: 'Created a local fork with Kilo cloud-session provenance.',
        };
    }

    async continue(input: SessionContinueCloudSessionInput): Promise<CloudSessionActionResult> {
        const [source, accessContext] = await Promise.all([
            cloudSessionStore.getById(input.profileId, input.cloudSessionId),
            resolveKiloCloudSessionAccessContext(input.profileId),
        ]);
        if (!source) {
            return {
                ok: false,
                reason: 'cloud_session_not_found',
                message: 'The cloud session record was not found.',
            };
        }
        if (accessContext.isErr()) {
            return {
                ok: false,
                reason: 'cloud_prerequisites_blocked',
                message: accessContext.error.message,
            };
        }
        if (source.remoteScopeKey !== accessContext.value.scope.remoteScopeKey) {
            return {
                ok: false,
                reason: 'scope_mismatch',
                message: 'The cloud session belongs to a different Kilo account or organization scope.',
            };
        }

        const created = await sessionStore.create(input.profileId, input.threadId, 'cloud', {
            cloudSession: this.copyCloudMetadata(source, { continuedFromCloudSessionId: source.id }),
            cloudSessionAuthorityState: 'continued',
        });
        if (!created.created) {
            return resultMessageForCreateFailure(created.reason);
        }

        const cloudSession = created.session.cloudSession;
        if (!cloudSession) {
            return resultMessageForCreateFailure('cloud_binding_failed');
        }

        return {
            ok: true,
            session: created.session,
            cloudSession,
            ...(await this.readThread(input.profileId, created.session.threadId)),
            message: 'Prepared a continued Kilo cloud-session binding. Remote execution remains disabled until Slice 7D lands.',
        };
    }

    private copyCloudMetadata(source: CloudSessionSummaryRecord, extraMetadata: Record<string, unknown>) {
        return buildScopeMetadata({
            remoteSessionId: source.remoteSessionId,
            remoteScopeKey: source.remoteScopeKey,
            ...(source.accountId ? { accountId: source.accountId } : {}),
            ...(source.organizationId ? { organizationId: source.organizationId } : {}),
            ...(source.title ? { title: source.title } : {}),
            ...(source.remoteCreatedAt ? { remoteCreatedAt: source.remoteCreatedAt } : {}),
            ...(source.remoteUpdatedAt ? { remoteUpdatedAt: source.remoteUpdatedAt } : {}),
            metadata: {
                ...source.metadata,
                ...extraMetadata,
            },
        });
    }

    private async readThread(profileId: string, threadId: string): Promise<{ thread?: ThreadListRecord }> {
        const thread = await threadStore.getListRecordById(profileId, threadId);
        return thread ? { thread } : {};
    }
}

export const cloudSessionService = new CloudSessionService();
