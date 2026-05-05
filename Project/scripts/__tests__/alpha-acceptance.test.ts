import { describe, expect, it } from 'vitest';

import { buildAlphaAcceptanceReport, formatAlphaAcceptanceReport } from '@/scripts/alpha-acceptance';

describe('alpha acceptance report', () => {
    it('keeps first-alpha exit blocked only by manual shell signoff', () => {
        const report = buildAlphaAcceptanceReport();

        expect(report.status).toBe('blocked');
        expect(report.criteria.map((criterion) => criterion.id)).toEqual([
            'manual-shell-signoff',
            'code-accessibility',
            'sandbox-run-contract-ux',
            'operator-diagnostics',
            'health-command-surface',
            'internal-evals',
            'workspace-icons',
            'repo-research-acceptance',
            'repo-workflow-guardrails',
            'document-artifacts',
            'workbench-shell-polish',
            'sandbox-diagnostics',
            'prompt-orchestration',
            'persistence-hardening',
        ]);

        const blockedCriteria = report.criteria.filter((criterion) => criterion.status === 'blocked');
        const passedCriteria = report.criteria.filter((criterion) => criterion.status === 'passed');

        expect(blockedCriteria.map((criterion) => criterion.id)).toEqual(['manual-shell-signoff']);
        expect(passedCriteria).toHaveLength(report.criteria.length - 1);
        expect(report.criteria.find((criterion) => criterion.id === 'manual-shell-signoff')?.status).toBe('blocked');
    });

    it('formats a readable release-manifest report', () => {
        const report = buildAlphaAcceptanceReport();
        const formatted = formatAlphaAcceptanceReport(report);

        expect(formatted).toContain('status: blocked');
        expect(formatted).toContain('Slice 8C manual shell sign-off');
        expect(formatted).toContain('Slice 8A sandbox run-contract UX');
        expect(formatted).toContain('Slice 8G internal evals and trace graders');
        expect(formatted).toContain('Slice 8I repo-research acceptance coverage');
        expect(formatted).toContain('Slice 8O prompt orchestration hardening');
        expect(formatted).toContain('Slice 8P persistence hardening');
    });
});
