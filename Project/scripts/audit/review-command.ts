import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { refreshStaleReviewEntries, removeReviewManifestEntry, setReviewManifestEntry } from '@/scripts/audit/reviewManifest';
import { scriptLog } from '@/scripts/logger';

import type { ReviewManifestStatus } from '@/scripts/audit/types';


function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

function readOption(args: string[], name: string): string | undefined {
    const prefix = `${name}=`;
    const exactMatch = args.find((argument) => argument.startsWith(prefix));
    if (exactMatch) {
        return exactMatch.slice(prefix.length);
    }

    const optionIndex = args.findIndex((argument) => argument === name);
    if (optionIndex === -1) {
        return undefined;
    }

    return args[optionIndex + 1];
}

function assertPresent(value: string | undefined, label: string): string {
    if (!value) {
        throw new Error(`Missing required option: ${label}`);
    }

    return value;
}

function isReviewStatus(value: string): value is ReviewManifestStatus {
    return value === 'reviewed-clean' || value === 'accepted-risk' || value === 'needs-refactor';
}

export function runAuditReviewCommand(): void {
    runAuditReviewCommandWithArgs({
        args: process.argv.slice(2),
        rootDir: process.cwd(),
    });
}

export function runAuditReviewCommandWithArgs(input: { args: string[]; rootDir: string }): void {
    if (input.args.includes('--refresh-stale')) {
        const manifest = refreshStaleReviewEntries(input.rootDir);
        scriptLog.info({
            tag: 'agents.audit.review',
            message: 'Refreshed stale review entries.',
            entries: manifest.entries.length,
        });
        return;
    }

    const targetPath = assertPresent(readOption(input.args, '--path'), '--path');
    const category = assertPresent(readOption(input.args, '--category'), '--category');

    if (input.args.includes('--remove')) {
        const manifest = removeReviewManifestEntry({
            rootDir: input.rootDir,
            path: targetPath,
            category,
        });
        scriptLog.info({
            tag: 'agents.audit.review',
            message: 'Removed review entry.',
            path: targetPath,
            category,
            entries: manifest.entries.length,
        });
        return;
    }

    const statusValue = assertPresent(readOption(input.args, '--status'), '--status');
    if (!isReviewStatus(statusValue)) {
        throw new Error(`Invalid review status: ${statusValue}`);
    }

    const note = readOption(input.args, '--note');
    const manifestInput: {
        rootDir: string;
        path: string;
        category: string;
        status: ReviewManifestStatus;
        note?: string;
    } = {
        rootDir: input.rootDir,
        path: targetPath,
        category,
        status: statusValue,
    };
    if (note !== undefined) {
        manifestInput.note = note;
    }

    const manifest = setReviewManifestEntry(manifestInput);

    scriptLog.info({
        tag: 'agents.audit.review',
        message: 'Recorded review entry.',
        path: targetPath,
        category,
        status: statusValue,
        entries: manifest.entries.length,
    });
}

if (isDirectExecution(import.meta.url)) {
    runAuditReviewCommand();
}

