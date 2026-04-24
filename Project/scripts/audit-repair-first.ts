import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    buildRepairFirstReport,
    formatRepairFirstSummary,
    formatRepairFirstWorklist,
    type RepairFirstReport,
} from '@/scripts/audit/repairFirstRules';
import { scriptLog } from '@/scripts/logger';

export function hasRepairFirstFindings(report: RepairFirstReport): boolean {
    return report.findings.length > 0;
}

export function runRepairFirstAudit(
    options: {
        rootDir?: string;
        outputMode?: 'summary' | 'json' | 'worklist';
        failOnFindings?: boolean;
    } = {}
): RepairFirstReport {
    const rootDir = options.rootDir ?? process.cwd();
    const report = buildRepairFirstReport(rootDir);
    const outputMode = options.outputMode ?? 'summary';

    if (outputMode === 'json') {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else if (outputMode === 'worklist') {
        process.stdout.write(`${formatRepairFirstWorklist(report)}\n`);
    } else {
        process.stdout.write(`${formatRepairFirstSummary(report)}\n`);
    }

    if (options.failOnFindings && hasRepairFirstFindings(report)) {
        process.exitCode = 1;
    }

    return report;
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    const outputMode = process.argv.includes('--json')
        ? 'json'
        : process.argv.includes('--worklist')
          ? 'worklist'
          : 'summary';

    const report = runRepairFirstAudit({
        outputMode,
        failOnFindings: process.argv.includes('--check'),
    });

    if (process.argv.includes('--check') && hasRepairFirstFindings(report)) {
        scriptLog.error({
            tag: 'repair-first.audit',
            message: 'Repair-first audit failed because unresolved repair items remain.',
        });
    }
}
