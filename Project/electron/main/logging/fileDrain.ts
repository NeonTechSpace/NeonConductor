import { app } from 'electron';
import { log, type DrainContext, type WideEvent } from 'evlog';
import { createDrainPipeline, type PipelineDrainFn } from 'evlog/pipeline';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const LOG_SUBDIRECTORY = 'logs';

let drain: PipelineDrainFn<DrainContext> | null = null;

function resolveLogsDirectory(): string {
    return path.join(app.getPath('userData'), LOG_SUBDIRECTORY);
}

function resolveEventDate(event: WideEvent): string {
    const timestamp = typeof event.timestamp === 'string' ? event.timestamp : '';
    const datePart = timestamp.slice(0, 10);

    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        return datePart;
    }

    return new Date().toISOString().slice(0, 10);
}

function resolveLogFilePath(event: WideEvent): string {
    const date = resolveEventDate(event);
    return path.join(resolveLogsDirectory(), `${date}.ndjson`);
}

async function writeBatch(contexts: DrainContext[]): Promise<void> {
    if (contexts.length === 0) {
        return;
    }

    const logsDirectory = resolveLogsDirectory();
    await mkdir(logsDirectory, { recursive: true });

    const groupedLines = new Map<string, string[]>();

    for (const context of contexts) {
        const filePath = resolveLogFilePath(context.event);
        const line = `${JSON.stringify(context.event)}\n`;
        const existingLines = groupedLines.get(filePath);

        if (existingLines) {
            existingLines.push(line);
        } else {
            groupedLines.set(filePath, [line]);
        }
    }

    const writes: Promise<void>[] = [];

    for (const [filePath, lines] of groupedLines.entries()) {
        writes.push(appendFile(filePath, lines.join(''), 'utf8'));
    }

    await Promise.all(writes);
}

function createBatchedDrain(): PipelineDrainFn<DrainContext> {
    const createPipeline = createDrainPipeline<DrainContext>({
        batch: {
            size: 25,
            intervalMs: 2000,
        },
        retry: {
            maxAttempts: 2,
            backoff: 'exponential',
            initialDelayMs: 250,
            maxDelayMs: 2000,
        },
        maxBufferSize: 2000,
        onDropped: (events, error) => {
            log.error({
                tag: 'logging',
                message: `Dropped ${String(events.length)} event(s) from file drain.`,
                ...(error instanceof Error ? { error: error.message } : { error: String(error) }),
            });
        },
    });

    return createPipeline(async (batch) => {
        await writeBatch(batch);
    });
}

export function getLogDrain(): PipelineDrainFn<DrainContext> {
    if (!drain) {
        drain = createBatchedDrain();
    }

    return drain;
}

export async function flushLogDrain(): Promise<void> {
    if (!drain) {
        return;
    }

    await drain.flush();
}
