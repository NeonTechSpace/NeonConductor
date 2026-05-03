import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type AlphaAcceptanceStatus = 'passed' | 'blocked';

export interface AlphaAcceptanceCriterion {
    id: string;
    title: string;
    status: AlphaAcceptanceStatus;
    detail: string;
}

export interface AlphaAcceptanceReport {
    status: AlphaAcceptanceStatus;
    criteria: AlphaAcceptanceCriterion[];
}

export function buildAlphaAcceptanceReport(): AlphaAcceptanceReport {
    const criteria: AlphaAcceptanceCriterion[] = [
        {
            id: 'manual-shell-signoff',
            title: 'Slice 8C manual shell sign-off',
            status: 'blocked',
            detail: 'The live shell checklist is still postponed and must pass across the required size matrix.',
        },
        {
            id: 'internal-evals',
            title: 'Slice 8F internal evals and trace graders',
            status: 'blocked',
            detail: 'Replayable acceptance coverage for critical run, memory, promotion, and cloud paths is not landed.',
        },
        {
            id: 'workspace-icons',
            title: 'Slice 8H workspace icon identity',
            status: 'passed',
            detail: 'Workspace-root icon detection, manual override, refresh, and shared rendering are landed.',
        },
        {
            id: 'repo-research-acceptance',
            title: 'Slice 8I repo-research acceptance coverage',
            status: 'blocked',
            detail: 'Repo-research checkout/root-policy and VCS explanation acceptance coverage is not landed.',
        },
    ];

    return {
        status: criteria.some((criterion) => criterion.status === 'blocked') ? 'blocked' : 'passed',
        criteria,
    };
}

export function formatAlphaAcceptanceReport(report: AlphaAcceptanceReport): string {
    return [
        'First-alpha acceptance report',
        `status: ${report.status}`,
        '',
        ...report.criteria.map(
            (criterion) =>
                `- ${criterion.status.toUpperCase()} [${criterion.id}] ${criterion.title} - ${criterion.detail}`
        ),
    ].join('\n');
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    const report = buildAlphaAcceptanceReport();
    if (process.argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatAlphaAcceptanceReport(report)}\n`);
    }

    if (process.argv.includes('--check') && report.status !== 'passed') {
        process.exitCode = 1;
    }
}
