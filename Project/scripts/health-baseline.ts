import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    buildRepairFirstReport,
    formatRepairFirstSummary,
    formatRepairFirstWorklist,
    type RepairFirstReport,
} from '@/scripts/audit/repairFirstRules';
import { buildTestHealthReport, formatTestHealthReport, type TestHealthReport } from '@/scripts/test-health';

export interface HealthBaselineReport {
    status: 'clear' | 'blocked';
    rootDir: string;
    repairBaseline: RepairFirstReport;
    testHealth: TestHealthReport;
}

export function buildHealthBaselineReport(rootDir: string): HealthBaselineReport {
    const repairBaseline = buildRepairFirstReport(rootDir);
    const testHealth = buildTestHealthReport(rootDir);
    return {
        status: repairBaseline.status === 'clear' && testHealth.status === 'clear' ? 'clear' : 'blocked',
        rootDir,
        repairBaseline,
        testHealth,
    };
}

export function hasHealthBaselineFindings(report: HealthBaselineReport): boolean {
    return report.status !== 'clear';
}

export function formatHealthBaselineWorklist(report: HealthBaselineReport): string {
    return [
        'Health baseline worklist',
        `status: ${report.status}`,
        '',
        '## Durable repair baseline',
        formatRepairFirstWorklist(report.repairBaseline),
        '',
        '## Test health',
        formatTestHealthReport(report.testHealth),
    ].join('\n');
}

export function formatHealthBaselineSummary(report: HealthBaselineReport): string {
    return [
        'Health baseline completed.',
        `status: ${report.status}`,
        '',
        formatRepairFirstSummary(report.repairBaseline),
        '',
        formatTestHealthReport(report.testHealth),
    ].join('\n');
}

export function runHealthBaseline(
    options: {
        rootDir?: string;
        outputMode?: 'summary' | 'json' | 'worklist';
        failOnFindings?: boolean;
    } = {}
): HealthBaselineReport {
    const rootDir = options.rootDir ?? process.cwd();
    const report = buildHealthBaselineReport(rootDir);
    const outputMode = options.outputMode ?? 'summary';

    if (outputMode === 'json') {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else if (outputMode === 'worklist') {
        process.stdout.write(`${formatHealthBaselineWorklist(report)}\n`);
    } else {
        process.stdout.write(`${formatHealthBaselineSummary(report)}\n`);
    }

    if (options.failOnFindings && hasHealthBaselineFindings(report)) {
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

    runHealthBaseline({
        outputMode,
        failOnFindings: process.argv.includes('--check'),
    });
}
