import { permissionStore } from '@/app/backend/persistence/stores';
import { permissionDecisionInputSchema, permissionRequestInputSchema } from '@/app/backend/runtime/contracts';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const permissionRouter = router({
    request: publicProcedure.input(permissionRequestInputSchema).mutation(async ({ input }) => {
        const record = await permissionStore.create(input);
        await runtimeEventLogService.append({
            entityType: 'permission',
            entityId: record.id,
            eventType: 'permission.requested',
            payload: {
                request: record,
            },
        });

        return { request: record };
    }),
    listPending: publicProcedure.query(async () => {
        return { requests: await permissionStore.listPending() };
    }),
    grant: publicProcedure.input(permissionDecisionInputSchema).mutation(async ({ input }) => {
        const record = await permissionStore.getById(input.requestId);
        if (!record) {
            return { updated: false as const, reason: 'not_found' as const };
        }
        if (record.decision === 'granted') {
            return { updated: false as const, reason: 'already_granted' as const, request: record };
        }

        const updatedRecord = await permissionStore.setDecision(input.requestId, 'granted');
        if (!updatedRecord) {
            return { updated: false as const, reason: 'not_found' as const };
        }

        await runtimeEventLogService.append({
            entityType: 'permission',
            entityId: updatedRecord.id,
            eventType: 'permission.granted',
            payload: {
                request: updatedRecord,
            },
        });

        return { updated: true as const, reason: null, request: updatedRecord };
    }),
    deny: publicProcedure.input(permissionDecisionInputSchema).mutation(async ({ input }) => {
        const record = await permissionStore.getById(input.requestId);
        if (!record) {
            return { updated: false as const, reason: 'not_found' as const };
        }
        if (record.decision === 'denied') {
            return { updated: false as const, reason: 'already_denied' as const, request: record };
        }

        const updatedRecord = await permissionStore.setDecision(input.requestId, 'denied');
        if (!updatedRecord) {
            return { updated: false as const, reason: 'not_found' as const };
        }

        await runtimeEventLogService.append({
            entityType: 'permission',
            entityId: updatedRecord.id,
            eventType: 'permission.denied',
            payload: {
                request: updatedRecord,
            },
        });

        return { updated: true as const, reason: null, request: updatedRecord };
    }),
});
