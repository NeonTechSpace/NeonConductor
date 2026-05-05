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

const alphaAcceptanceCriteria = [
    {
        id: 'manual-shell-signoff',
        title: 'Slice 8C manual shell sign-off',
        status: 'blocked',
        detail: 'The live shell checklist is still postponed and must pass across the required size matrix.',
    },
    {
        id: 'code-accessibility',
        title: 'Slice 8B code-side accessibility hardening',
        status: 'passed',
        detail: 'Public Sessions and Settings surfaces have code-side ARIA, label, tab, menu, and listbox coverage.',
    },
    {
        id: 'sandbox-run-contract-ux',
        title: 'Slice 8A sandbox run-contract UX',
        status: 'passed',
        detail: 'Run contracts distinguish detached, workspace, scheduled sandbox, and materialized sandbox targets.',
    },
    {
        id: 'operator-diagnostics',
        title: 'Slice 8D operator diagnostics',
        status: 'passed',
        detail: 'Shared diagnostic cards explain run-contract, queue, registry, cloud, memory, and prompt-risk facts.',
    },
    {
        id: 'health-command-surface',
        title: 'Slice 8E health command surface',
        status: 'passed',
        detail: 'Generated, health, report, and desktop command profiles replace historical repair-first script names.',
    },
    {
        id: 'internal-evals',
        title: 'Slice 8G internal evals and trace graders',
        status: 'passed',
        detail: 'Replayable internal eval scenarios cover critical run, memory, promotion, and cloud-session paths.',
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
        status: 'passed',
        detail: 'Backend repo-research root policy, checkout planning, run-contract, and internal eval coverage are landed.',
    },
    {
        id: 'repo-workflow-guardrails',
        title: 'Slices 8J and 8K guarded repo workflow',
        status: 'passed',
        detail: 'Guarded commit, selected Git path commits, guarded Git push, and editable generated repo text are landed.',
    },
    {
        id: 'document-artifacts',
        title: 'Slice 8L PDF artifact path',
        status: 'passed',
        detail: 'PDF artifacts store local files, extract bounded page text, and surface inclusion/omission state in contracts.',
    },
    {
        id: 'workbench-shell-polish',
        title: 'Slice 8M workbench shell polish',
        status: 'passed',
        detail: 'Typed workbench rows, inspector navigation, queue review reuse, and active-run stop wiring are landed.',
    },
    {
        id: 'sandbox-diagnostics',
        title: 'Slice 8N sandbox diagnostics',
        status: 'passed',
        detail: 'Filesystem, network, process sandbox, Windows, WSL, degraded, and fail-closed diagnostics are visible.',
    },
    {
        id: 'prompt-orchestration',
        title: 'Slice 8O prompt orchestration hardening',
        status: 'passed',
        detail: 'Runtime prompt fragments, worker presets, planner research retargeting, and eval gates are landed.',
    },
    {
        id: 'persistence-hardening',
        title: 'Slice 8P persistence hardening',
        status: 'passed',
        detail: 'Generated schema checks, canonical baseline checks, lane reset rebuild, and fixture scaffolding are landed.',
    },
] satisfies AlphaAcceptanceCriterion[];

export function buildAlphaAcceptanceReport(): AlphaAcceptanceReport {
    const criteria = alphaAcceptanceCriteria.map((criterion) => ({ ...criterion }));

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
