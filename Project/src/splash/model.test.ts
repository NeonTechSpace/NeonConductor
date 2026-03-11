import { describe, expect, it } from 'vitest';

import { applyBootStatus, normalizeBootStatusSnapshot } from '@/web/splash/model';

describe('splash model', () => {
    it('normalizes unknown status payloads back to the initial boot state', () => {
        expect(normalizeBootStatusSnapshot(undefined)).toMatchObject({
            stage: 'main_initializing',
        });
        expect(normalizeBootStatusSnapshot({ stage: 'unexpected' })).toMatchObject({
            stage: 'main_initializing',
        });
    });

    it('applies boot status content without rebuilding the target', () => {
        const headlineTarget = {
            textContent: 'NeonConductor',
        };
        const subtitleTarget = {
            textContent: 'Initializing the desktop runtime.',
        };
        const diagnosticsTarget = {
            textContent: '',
        };
        const target = {
            body: {
                dataset: {} as Record<string, string | undefined>,
            },
            getElementById: (id: string) => {
                if (id === 'splash-headline') {
                    return headlineTarget;
                }
                if (id === 'splash-subtitle') {
                    return subtitleTarget;
                }
                if (id === 'splash-diagnostics') {
                    return diagnosticsTarget;
                }
                return null;
            },
        };

        applyBootStatus(target, {
            stage: 'boot_stuck',
            headline: 'Startup is taking longer than expected',
            detail: 'Waiting on: shell bootstrap data.',
            isStuck: true,
            blockingPrerequisite: 'shell_bootstrap',
            elapsedMs: 4000,
            source: 'main',
        });

        expect(target.body.dataset['bootStage']).toBe('boot_stuck');
        expect(headlineTarget.textContent).toBe('Startup is taking longer than expected');
        expect(subtitleTarget.textContent).toBe('Waiting on: shell bootstrap data.');
        expect(diagnosticsTarget.textContent).toBe('Elapsed: 4.0s');
    });

    it('keeps headline, subtitle, and elapsed diagnostics distinct during progress updates', () => {
        const headlineTarget = {
            textContent: 'Starting NeonConductor',
        };
        const subtitleTarget = {
            textContent: 'Initializing the desktop runtime.',
        };
        const diagnosticsTarget = {
            textContent: '',
        };
        const target = {
            body: {
                dataset: {} as Record<string, string | undefined>,
            },
            getElementById: (id: string) => {
                if (id === 'splash-headline') {
                    return headlineTarget;
                }
                if (id === 'splash-subtitle') {
                    return subtitleTarget;
                }
                if (id === 'splash-diagnostics') {
                    return diagnosticsTarget;
                }
                return null;
            },
        };

        applyBootStatus(target, {
            stage: 'profile_resolving',
            headline: 'Resolving the active profile',
            detail: 'Waiting for the active workspace profile.',
            isStuck: false,
            blockingPrerequisite: null,
            elapsedMs: 1250,
            source: 'renderer',
        });

        expect(headlineTarget.textContent).toBe('Resolving the active profile');
        expect(subtitleTarget.textContent).toBe('Waiting for the active workspace profile.');
        expect(diagnosticsTarget.textContent).toBe('Elapsed: 1.3s');
    });
});
