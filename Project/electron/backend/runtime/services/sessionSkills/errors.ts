import { err } from 'neverthrow';

import type { SessionGetAttachedSkillsInput } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalError, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

export type SessionSkillsResult<T> = OperationalResult<T>;

export function okSessionSkills<T>(value: T): SessionSkillsResult<T> {
    return okOp(value);
}

export function errSessionSkills(
    code: 'not_found' | 'invalid_payload',
    message: string,
    details?: Record<string, unknown>
): SessionSkillsResult<never> {
    return errOp(code, message, details ? { details } : undefined);
}

export function forwardSessionSkillsError<T>(error: OperationalError): SessionSkillsResult<T> {
    return err(error);
}

export function missingSessionError(sessionId: SessionGetAttachedSkillsInput['sessionId']): SessionSkillsResult<never> {
    return errSessionSkills('not_found', `Session "${sessionId}" was not found.`, { sessionId });
}

export function missingSessionThreadError(
    sessionId: SessionGetAttachedSkillsInput['sessionId']
): SessionSkillsResult<never> {
    return errSessionSkills('not_found', `Thread for session "${sessionId}" was not found.`, { sessionId });
}
