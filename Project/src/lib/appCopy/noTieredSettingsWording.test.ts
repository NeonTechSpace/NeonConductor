import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const thisDirectory = dirname(fileURLToPath(import.meta.url));
const researchPlanPath = resolve(thisDirectory, '../../../../Research/NeonConductor MVP Roadmap.md');

describe('settings wording regression', () => {
    it('does not reintroduce tiered settings language into the MVP roadmap', () => {
        const contents = readFileSync(researchPlanPath, 'utf8');

        expect(contents).not.toMatch(/basic\/advanced variants/i);
        expect(contents).not.toMatch(/tiered basic\/advanced/i);
        expect(contents).not.toMatch(/non-coder/i);
        expect(contents).not.toMatch(/dev mode/i);
    });
});
