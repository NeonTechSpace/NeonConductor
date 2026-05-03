import { describe, expect, it } from 'vitest';

import { buildAlphaAcceptanceReport, formatAlphaAcceptanceReport } from '@/scripts/alpha-acceptance';

describe('alpha acceptance report', () => {
    it('keeps first-alpha exit blocked until remaining finish-line slices land', () => {
        const report = buildAlphaAcceptanceReport();

        expect(report.status).toBe('blocked');
        expect(report.criteria.map((criterion) => criterion.id)).toEqual([
            'manual-shell-signoff',
            'internal-evals',
            'workspace-icons',
            'repo-research-acceptance',
        ]);
        expect(report.criteria.find((criterion) => criterion.id === 'internal-evals')?.status).toBe('passed');
        expect(report.criteria.find((criterion) => criterion.id === 'workspace-icons')?.status).toBe('passed');
        expect(report.criteria.find((criterion) => criterion.id === 'manual-shell-signoff')?.status).toBe('blocked');
        expect(report.criteria.find((criterion) => criterion.id === 'repo-research-acceptance')?.status).toBe('passed');
        expect(formatAlphaAcceptanceReport(report)).toContain('Slice 8C manual shell sign-off');
        expect(formatAlphaAcceptanceReport(report)).toContain('Slice 8G internal evals and trace graders');
        expect(formatAlphaAcceptanceReport(report)).toContain('Slice 8I repo-research acceptance coverage');
    });
});
