import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('splash html', () => {
    it('links splash styles from the document head for render-blocking first paint', () => {
        const source = readFileSync(path.join(process.cwd(), 'splash.html'), 'utf8');

        expect(source).toContain('<link rel="stylesheet" href="/src/splash/styles.css" />');
    });

    it('assigns the mascot source before the splash module boot script runs', () => {
        const source = readFileSync(path.join(process.cwd(), 'splash.html'), 'utf8');

        expect(source).toContain('window.neonSplash?.getBootstrapPayload()');
        expect(source).toContain("document.querySelector('[data-splash-mascot]')");
        expect(source.indexOf('window.neonSplash?.getBootstrapPayload()')).toBeLessThan(
            source.indexOf('<script type="module" src="/src/splash/main.ts"></script>')
        );
    });

    it('locks mascot intrinsic dimensions in the HTML before CSS and image decode complete', () => {
        const source = readFileSync(path.join(process.cwd(), 'splash.html'), 'utf8');

        expect(source).toContain('<img data-splash-mascot alt="NeonConductor mascot" width="168" height="212" />');
    });
});
