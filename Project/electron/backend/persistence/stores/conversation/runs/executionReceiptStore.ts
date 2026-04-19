import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import { isJsonRecord, nowIso, parseJsonValue } from '@/app/backend/persistence/stores/shared/utils';
import type { ExecutionReceipt } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';

function isExecutionReceiptJson(value: unknown): value is ExecutionReceipt['contract'] {
    return isJsonRecord(value);
}

function mapReceipt(row: {
    id: string;
    profile_id: string;
    session_id: string;
    run_id: string;
    contract_json: string;
    approvals_used_json: string;
    tools_invoked_json: string;
    memory_hit_count: number;
    cache_result_json: string;
    usage_summary_json: string;
    terminal_outcome_json: string;
    created_at: string;
}): ExecutionReceipt {
    const contract = parseJsonValue(row.contract_json, undefined as ExecutionReceipt['contract'] | undefined, isExecutionReceiptJson);
    if (!contract) {
        throw new DataCorruptionError('Execution receipt contract payload is invalid.');
    }

    return {
        id: parseEntityId(row.id, 'execution_receipts.id', 'rcpt'),
        profileId: row.profile_id,
        sessionId: parseEntityId(row.session_id, 'execution_receipts.session_id', 'sess'),
        runId: parseEntityId(row.run_id, 'execution_receipts.run_id', 'run'),
        contract,
        approvalsUsed: parseJsonValue(
            row.approvals_used_json,
            [] as ExecutionReceipt['approvalsUsed'],
            Array.isArray
        ) as ExecutionReceipt['approvalsUsed'],
        toolsInvoked: parseJsonValue(
            row.tools_invoked_json,
            [] as ExecutionReceipt['toolsInvoked'],
            Array.isArray
        ) as ExecutionReceipt['toolsInvoked'],
        memoryHitCount: row.memory_hit_count,
        cacheResult: parseJsonValue(
            row.cache_result_json,
            { applied: false } as ExecutionReceipt['cacheResult'],
            isJsonRecord
        ) as ExecutionReceipt['cacheResult'],
        usageSummary: parseJsonValue(
            row.usage_summary_json,
            {} as ExecutionReceipt['usageSummary'],
            isJsonRecord
        ) as ExecutionReceipt['usageSummary'],
        terminalOutcome: parseJsonValue(
            row.terminal_outcome_json,
            { kind: 'aborted' } as ExecutionReceipt['terminalOutcome'],
            isJsonRecord
        ) as ExecutionReceipt['terminalOutcome'],
        createdAt: row.created_at,
    };
}

export class ExecutionReceiptStore {
    async create(input: Omit<ExecutionReceipt, 'id' | 'createdAt'>): Promise<ExecutionReceipt> {
        const { db } = getPersistence();
        const id = createEntityId('rcpt');
        const createdAt = nowIso();
        const row = await db
            .insertInto('execution_receipts')
            .values({
                id,
                profile_id: input.profileId,
                session_id: input.sessionId,
                run_id: input.runId,
                contract_json: JSON.stringify(input.contract),
                approvals_used_json: JSON.stringify(input.approvalsUsed),
                tools_invoked_json: JSON.stringify(input.toolsInvoked),
                memory_hit_count: input.memoryHitCount,
                cache_result_json: JSON.stringify(input.cacheResult),
                usage_summary_json: JSON.stringify(input.usageSummary),
                terminal_outcome_json: JSON.stringify(input.terminalOutcome),
                created_at: createdAt,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
        return mapReceipt(row);
    }

    async getByRunId(profileId: string, runId: ExecutionReceipt['runId']): Promise<ExecutionReceipt | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('execution_receipts')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('run_id', '=', runId)
            .executeTakeFirst();
        return row ? mapReceipt(row) : null;
    }
}

export const executionReceiptStore = new ExecutionReceiptStore();
