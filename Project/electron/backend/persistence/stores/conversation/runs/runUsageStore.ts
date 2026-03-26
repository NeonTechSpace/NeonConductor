import { sql } from 'kysely';

import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type {
    OpenAISubscriptionUsageSummary,
    OpenAISubscriptionUsageWindowSummary,
    ProviderUsageSummary,
    RunUsageRecord,
} from '@/app/backend/persistence/types';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';
import { appLog } from '@/app/main/logging';

function readNumber(value: number | null): number | undefined {
    return value === null ? undefined : value;
}

const billedViaValues = ['kilo_gateway', 'openai_api', 'openai_subscription', 'zai_api', 'moonshot_api'] as const;
type BilledVia = (typeof billedViaValues)[number];

function parseBilledVia(value: string): BilledVia {
    return parseEnumValue(value, 'run_usage.billed_via', billedViaValues);
}

function mapRunUsageRecord(row: {
    run_id: string;
    provider_id: string;
    model_id: string;
    input_tokens: number | null;
    output_tokens: number | null;
    cached_tokens: number | null;
    reasoning_tokens: number | null;
    total_tokens: number | null;
    latency_ms: number | null;
    cost_microunits: number | null;
    billed_via: string;
    recorded_at: string;
}): RunUsageRecord {
    const record: RunUsageRecord = {
        runId: parseEntityId(row.run_id, 'run_usage.run_id', 'run'),
        providerId: assertSupportedProviderId(row.provider_id),
        modelId: row.model_id,
        billedVia: parseBilledVia(row.billed_via),
        recordedAt: row.recorded_at,
    };

    const inputTokens = readNumber(row.input_tokens);
    const outputTokens = readNumber(row.output_tokens);
    const cachedTokens = readNumber(row.cached_tokens);
    const reasoningTokens = readNumber(row.reasoning_tokens);
    const totalTokens = readNumber(row.total_tokens);
    const latencyMs = readNumber(row.latency_ms);
    const costMicrounits = readNumber(row.cost_microunits);

    if (inputTokens !== undefined) record.inputTokens = inputTokens;
    if (outputTokens !== undefined) record.outputTokens = outputTokens;
    if (cachedTokens !== undefined) record.cachedTokens = cachedTokens;
    if (reasoningTokens !== undefined) record.reasoningTokens = reasoningTokens;
    if (totalTokens !== undefined) record.totalTokens = totalTokens;
    if (latencyMs !== undefined) record.latencyMs = latencyMs;
    if (costMicrounits !== undefined) record.costMicrounits = costMicrounits;

    return record;
}

function readAggregateNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    const message = `Invalid numeric aggregate value: ${String(value)}`;
    appLog.error({
        tag: 'persistence.run-usage',
        message,
    });
    throw new DataCorruptionError(message);
}

interface OpenAISubscriptionAggregateRow {
    run_count: unknown;
    input_tokens: unknown;
    output_tokens: unknown;
    cached_tokens: unknown;
    reasoning_tokens: unknown;
    total_tokens: unknown;
    total_cost_microunits: unknown;
    latency_sum_ms: unknown;
    latency_samples: unknown;
}

function buildOpenAISubscriptionWindowSummary(input: {
    row: OpenAISubscriptionAggregateRow;
    windowLabel: OpenAISubscriptionUsageWindowSummary['windowLabel'];
    windowStart: string;
    windowEnd: string;
}): OpenAISubscriptionUsageWindowSummary {
    const runCount = readAggregateNumber(input.row.run_count);
    const inputTokens = readAggregateNumber(input.row.input_tokens);
    const outputTokens = readAggregateNumber(input.row.output_tokens);
    const cachedTokens = readAggregateNumber(input.row.cached_tokens);
    const reasoningTokens = readAggregateNumber(input.row.reasoning_tokens);
    const totalTokens = readAggregateNumber(input.row.total_tokens);
    const totalCostMicrounits = readAggregateNumber(input.row.total_cost_microunits);
    const latencySumMs = readAggregateNumber(input.row.latency_sum_ms);
    const latencySamples = readAggregateNumber(input.row.latency_samples);

    const summary: OpenAISubscriptionUsageWindowSummary = {
        windowLabel: input.windowLabel,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        runCount,
        inputTokens,
        outputTokens,
        cachedTokens,
        reasoningTokens,
        totalTokens,
        totalCostMicrounits,
    };

    if (latencySamples > 0) {
        summary.averageLatencyMs = Math.round(latencySumMs / latencySamples);
    }

    return summary;
}

export interface UpsertRunUsageInput {
    runId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    costMicrounits?: number;
    billedVia: 'kilo_gateway' | 'openai_api' | 'openai_subscription' | 'zai_api' | 'moonshot_api';
}

export class RunUsageStore {
    async getByRunId(runId: string): Promise<RunUsageRecord | null> {
        const { db } = getPersistence();
        const row = await db.selectFrom('run_usage').selectAll().where('run_id', '=', runId).executeTakeFirst();

        return row ? mapRunUsageRecord(row) : null;
    }

    async upsert(input: UpsertRunUsageInput): Promise<RunUsageRecord> {
        const { db } = getPersistence();
        const recordedAt = nowIso();

        await db
            .insertInto('run_usage')
            .values({
                run_id: input.runId,
                provider_id: input.providerId,
                model_id: input.modelId,
                input_tokens: input.inputTokens ?? null,
                output_tokens: input.outputTokens ?? null,
                cached_tokens: input.cachedTokens ?? null,
                reasoning_tokens: input.reasoningTokens ?? null,
                total_tokens: input.totalTokens ?? null,
                latency_ms: input.latencyMs ?? null,
                cost_microunits: input.costMicrounits ?? null,
                billed_via: input.billedVia,
                recorded_at: recordedAt,
            })
            .onConflict((oc) =>
                oc.column('run_id').doUpdateSet({
                    provider_id: input.providerId,
                    model_id: input.modelId,
                    input_tokens: input.inputTokens ?? null,
                    output_tokens: input.outputTokens ?? null,
                    cached_tokens: input.cachedTokens ?? null,
                    reasoning_tokens: input.reasoningTokens ?? null,
                    total_tokens: input.totalTokens ?? null,
                    latency_ms: input.latencyMs ?? null,
                    cost_microunits: input.costMicrounits ?? null,
                    billed_via: input.billedVia,
                    recorded_at: recordedAt,
                })
            )
            .execute();

        const row = await db
            .selectFrom('run_usage')
            .selectAll()
            .where('run_id', '=', input.runId)
            .executeTakeFirstOrThrow();

        return mapRunUsageRecord(row);
    }

    async listByProfile(profileId: string): Promise<RunUsageRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('run_usage')
            .innerJoin('runs', 'runs.id', 'run_usage.run_id')
            .select([
                'run_usage.run_id as run_id',
                'run_usage.provider_id as provider_id',
                'run_usage.model_id as model_id',
                'run_usage.input_tokens as input_tokens',
                'run_usage.output_tokens as output_tokens',
                'run_usage.cached_tokens as cached_tokens',
                'run_usage.reasoning_tokens as reasoning_tokens',
                'run_usage.total_tokens as total_tokens',
                'run_usage.latency_ms as latency_ms',
                'run_usage.cost_microunits as cost_microunits',
                'run_usage.billed_via as billed_via',
                'run_usage.recorded_at as recorded_at',
            ])
            .where('runs.profile_id', '=', profileId)
            .orderBy('run_usage.recorded_at', 'asc')
            .execute();

        return rows.map(mapRunUsageRecord);
    }

    async summarizeByProfile(profileId: string): Promise<ProviderUsageSummary[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('run_usage')
            .innerJoin('runs', 'runs.id', 'run_usage.run_id')
            .select((eb) => [
                'run_usage.provider_id as provider_id',
                eb.fn.count<number>('run_usage.run_id').as('run_count'),
                eb.fn.coalesce(eb.fn.sum<number>('run_usage.total_tokens'), sql<number>`0`).as('total_tokens'),
                eb.fn
                    .coalesce(eb.fn.sum<number>('run_usage.cost_microunits'), sql<number>`0`)
                    .as('total_cost_microunits'),
            ])
            .where('runs.profile_id', '=', profileId)
            .groupBy('run_usage.provider_id')
            .orderBy('run_usage.provider_id', 'asc')
            .execute();

        return rows.map((row) => ({
            providerId: assertSupportedProviderId(row.provider_id),
            runCount: row.run_count,
            totalTokens: row.total_tokens,
            totalCostMicrounits: row.total_cost_microunits,
        }));
    }

    private async summarizeOpenAISubscriptionWindow(input: {
        profileId: string;
        windowStart: string;
        windowEnd: string;
        windowLabel: OpenAISubscriptionUsageWindowSummary['windowLabel'];
    }): Promise<OpenAISubscriptionUsageWindowSummary> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('run_usage')
            .innerJoin('runs', 'runs.id', 'run_usage.run_id')
            .select((eb) => [
                eb.fn.count<number>('run_usage.run_id').as('run_count'),
                eb.fn.coalesce(eb.fn.sum<number>('run_usage.input_tokens'), sql<number>`0`).as('input_tokens'),
                eb.fn.coalesce(eb.fn.sum<number>('run_usage.output_tokens'), sql<number>`0`).as('output_tokens'),
                eb.fn.coalesce(eb.fn.sum<number>('run_usage.cached_tokens'), sql<number>`0`).as('cached_tokens'),
                eb.fn.coalesce(eb.fn.sum<number>('run_usage.reasoning_tokens'), sql<number>`0`).as('reasoning_tokens'),
                eb.fn.coalesce(eb.fn.sum<number>('run_usage.total_tokens'), sql<number>`0`).as('total_tokens'),
                eb.fn
                    .coalesce(eb.fn.sum<number>('run_usage.cost_microunits'), sql<number>`0`)
                    .as('total_cost_microunits'),
                eb.fn.coalesce(eb.fn.sum<number>('run_usage.latency_ms'), sql<number>`0`).as('latency_sum_ms'),
                eb.fn.count<number>('run_usage.latency_ms').as('latency_samples'),
            ])
            .where('runs.profile_id', '=', input.profileId)
            .where('run_usage.billed_via', '=', 'openai_subscription')
            .where('run_usage.recorded_at', '>=', input.windowStart)
            .where('run_usage.recorded_at', '<=', input.windowEnd)
            .executeTakeFirstOrThrow();

        return buildOpenAISubscriptionWindowSummary({
            row,
            windowLabel: input.windowLabel,
            windowStart: input.windowStart,
            windowEnd: input.windowEnd,
        });
    }

    async summarizeOpenAISubscriptionUsage(
        profileId: string,
        now = new Date()
    ): Promise<OpenAISubscriptionUsageSummary> {
        const windowEnd = now.toISOString();
        const fiveHourStart = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
        const weeklyStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [fiveHour, weekly] = await Promise.all([
            this.summarizeOpenAISubscriptionWindow({
                profileId,
                windowStart: fiveHourStart,
                windowEnd,
                windowLabel: 'last_5_hours',
            }),
            this.summarizeOpenAISubscriptionWindow({
                profileId,
                windowStart: weeklyStart,
                windowEnd,
                windowLabel: 'last_7_days',
            }),
        ]);

        return {
            providerId: 'openai_codex',
            billedVia: 'openai_subscription',
            fiveHour,
            weekly,
        };
    }
}

export const runUsageStore = new RunUsageStore();
