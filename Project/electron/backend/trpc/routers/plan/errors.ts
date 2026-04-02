import { TRPCError } from '@trpc/server';

import type { PlanServiceError } from '@/app/backend/runtime/services/plan/errors';

export function toPlanTrpcError(error: PlanServiceError): TRPCError {
    switch (error.code) {
        case 'invalid_mode':
        case 'invalid_tab':
        case 'unsupported_tab':
            return new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
        case 'unanswered_questions':
        case 'not_approved':
        case 'not_cancellable':
        case 'follow_up_conflict':
        case 'revision_conflict':
            return new TRPCError({ code: 'CONFLICT', message: error.message, cause: error });
        case 'draft_generation_failed':
        case 'run_start_failed':
            return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message, cause: error });
    }
}
