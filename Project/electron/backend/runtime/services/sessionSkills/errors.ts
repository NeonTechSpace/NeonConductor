import { err } from 'neverthrow';

import type { EntityId } from '@/app/backend/runtime/contracts';
import {
    errOp,
    okOp,
    type OperationalError,
    type OperationalResult,
} from '@/app/backend/runtime/services/common/operationalError';

export type SessionRegistryResult<T> = OperationalResult<T>;
export type SessionSkillsResult<T> = SessionRegistryResult<T>;

export function okSessionRegistry<T>(value: T): SessionRegistryResult<T> {
    return okOp(value);
}

export function okSessionSkills<T>(value: T): SessionSkillsResult<T> {
    return okSessionRegistry(value);
}

export function errSessionRegistry(
    code: 'not_found' | 'invalid_payload',
    message: string,
    details?: Record<string, unknown>
): SessionRegistryResult<never> {
    return errOp(code, message, details ? { details } : undefined);
}

export function errSessionSkills(
    code: 'not_found' | 'invalid_payload',
    message: string,
    details?: Record<string, unknown>
): SessionSkillsResult<never> {
    return errSessionRegistry(code, message, details);
}

export function forwardSessionRegistryError<T>(error: OperationalError): SessionRegistryResult<T> {
    return err(error);
}

export function forwardSessionSkillsError<T>(error: OperationalError): SessionSkillsResult<T> {
    return forwardSessionRegistryError(error);
}

export function missingSessionError(sessionId: EntityId<'sess'>): SessionRegistryResult<never> {
    return errSessionRegistry('not_found', `Session "${sessionId}" was not found.`, { sessionId });
}

export function missingSessionThreadError(sessionId: EntityId<'sess'>): SessionRegistryResult<never> {
    return errSessionRegistry('not_found', `Thread for session "${sessionId}" was not found.`, { sessionId });
}
