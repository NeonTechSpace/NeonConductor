import { TRPCError } from '@trpc/server';

import type { OrchestratorExecutionError } from '@/app/backend/runtime/services/orchestrator/errors';

export function toOrchestratorTrpcError(error: OrchestratorExecutionError): TRPCError {
    switch (error.code) {
        case 'plan_not_found':
            return new TRPCError({ code: 'NOT_FOUND', message: error.message, cause: error });
        case 'invalid_tab':
            return new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
        case 'plan_not_approved':
            return new TRPCError({ code: 'CONFLICT', message: error.message, cause: error });
    }
}
