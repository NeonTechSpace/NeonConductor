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
        expect(formatAlphaAcceptanceReport(report)).toContain('Slice 8C manual shell sign-off');
    });
});
