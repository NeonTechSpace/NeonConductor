import path from 'node:path';

import { sessionStore, threadStore } from '@/app/backend/persistence/stores';
import type {
    CheckpointRollbackPreview,
    EntityId,
    ResolvedWorkspaceContext,
    ResolvedWorkspaceExecutionContext,
} from '@/app/backend/runtime/contracts';
import { isEntityId } from '@/app/backend/runtime/contracts';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

export interface CheckpointExecutionTarget {
    executionTargetKey: string;
    executionTargetKind: 'workspace' | 'sandbox';
    executionTargetLabel: string;
    absolutePath: string;
    workspaceFingerprint: string;
    sandboxId?: EntityId<'sb'>;
}

function toPathKey(absolutePath: string): string {
    return process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
}

export function normalizeExecutionTargetPath(absolutePath: string): string {
    return path.resolve(absolutePath.trim());
}

export function isResolvedWorkspaceExecutionContext(
    workspaceContext: ResolvedWorkspaceContext
): workspaceContext is ResolvedWorkspaceExecutionContext {
    return workspaceContext.kind === 'workspace' || workspaceContext.kind === 'sandbox';
}

export function resolveCheckpointExecutionTarget(
    workspaceContext: ResolvedWorkspaceContext
): CheckpointExecutionTarget | null {
    if (!isResolvedWorkspaceExecutionContext(workspaceContext)) {
        return null;
    }

    const normalizedPath = normalizeExecutionTargetPath(workspaceContext.absolutePath);
    const pathKey = toPathKey(normalizedPath);
    if (workspaceContext.kind === 'sandbox') {
        return {
            executionTargetKey: `sandbox:${pathKey}`,
            executionTargetKind: 'sandbox',
            executionTargetLabel: workspaceContext.label,
            absolutePath: normalizedPath,
            workspaceFingerprint: workspaceContext.workspaceFingerprint,
            sandboxId: workspaceContext.sandbox.id,
        };
    }

    return {
        executionTargetKey: `workspace:${pathKey}`,
        executionTargetKind: 'workspace',
        executionTargetLabel: workspaceContext.label,
        absolutePath: normalizedPath,
        workspaceFingerprint: workspaceContext.workspaceFingerprint,
    };
}

export async function listAffectedSessionsForExecutionTarget(input: {
    profileId: string;
    executionTargetKey: string;
}): Promise<CheckpointRollbackPreview['affectedSessions']> {
    const sessions = await sessionStore.list(input.profileId);
    const affectedSessions: CheckpointRollbackPreview['affectedSessions'] = [];

    for (const session of sessions) {
        const workspaceContext = await workspaceContextService.resolveForSession({
            profileId: input.profileId,
            sessionId: session.id,
            allowLazySandboxCreation: false,
        });
        if (!workspaceContext) {
            continue;
        }

        const executionTarget = resolveCheckpointExecutionTarget(workspaceContext);
        if (!executionTarget || executionTarget.executionTargetKey !== input.executionTargetKey) {
            continue;
        }

        const sessionThread = await threadStore.getBySessionId(input.profileId, session.id);
        if (!sessionThread) {
            continue;
        }

        if (isEntityId(sessionThread.thread.id, 'thr')) {
            affectedSessions.push({
                sessionId: session.id,
                threadId: sessionThread.thread.id,
                topLevelTab: sessionThread.thread.topLevelTab,
                threadTitle: sessionThread.thread.title,
            });
        }
    }

    return affectedSessions.sort((left, right) => {
        if (left.threadTitle !== right.threadTitle) {
            return left.threadTitle.localeCompare(right.threadTitle);
        }

        return left.sessionId.localeCompare(right.sessionId);
    });
}
