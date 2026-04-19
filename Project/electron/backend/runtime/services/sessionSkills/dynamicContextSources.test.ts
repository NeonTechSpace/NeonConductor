import { describe, expect, it } from 'vitest';

import { normalizeSkillDynamicContextSources } from '@/app/backend/runtime/services/sessionSkills/dynamicContextSources';

describe('dynamicContextSources normalization', () => {
    it('marks clearly read-only commands as safe', () => {
        expect(
            normalizeSkillDynamicContextSources([
                {
                    id: 'repo_status',
                    label: 'Repo status',
                    command: 'git status',
                    declaredSafetyClass: 'safe',
                    required: true,
                },
            ])
        ).toEqual([
            {
                id: 'repo_status',
                label: 'Repo status',
                command: 'git status',
                declaredSafetyClass: 'safe',
                required: true,
                validationState: 'valid',
                effectiveSafetyClass: 'safe',
            },
        ]);
    });

    it('fails closed on multi-command or operator-heavy declarations', () => {
        const [invalidSource] = normalizeSkillDynamicContextSources([
            {
                id: 'repo_combo',
                label: 'Repo combo',
                command: 'git status && git diff',
                declaredSafetyClass: 'safe',
                required: false,
            },
        ]);

        expect(invalidSource?.validationState).toBe('invalid');
        expect(invalidSource?.validationMessage).toContain('single shell command');
    });

    it('escalates ambiguous commands to unsafe instead of silently trusting them', () => {
        expect(
            normalizeSkillDynamicContextSources([
                {
                    id: 'custom_script',
                    label: 'Custom script',
                    command: 'node scripts/report.js',
                    declaredSafetyClass: 'safe',
                    required: false,
                },
            ])
        ).toEqual([
            {
                id: 'custom_script',
                label: 'Custom script',
                command: 'node scripts/report.js',
                declaredSafetyClass: 'safe',
                required: false,
                validationState: 'valid',
                effectiveSafetyClass: 'unsafe',
            },
        ]);
    });
});
