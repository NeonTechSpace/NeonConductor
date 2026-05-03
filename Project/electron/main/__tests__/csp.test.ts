import { describe, expect, it } from 'vitest';

import { buildCspPolicy } from '@/app/main/security/cspPolicy';

describe('buildCspPolicy', () => {
    it('includes dev server http and ws origins', () => {
        const policy = buildCspPolicy('dev', { devServerUrl: 'http://127.0.0.1:5173' });
        const connectSrc = policy['connect-src'] ?? [];

        expect(connectSrc).toContain('http://127.0.0.1:5173');
        expect(connectSrc).toContain('ws://127.0.0.1:5173');
    });

    it('does not allow unsafe-inline scripts in prod', () => {
        const policy = buildCspPolicy('prod');
        const scriptSrc = policy['script-src'] ?? [];

        expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it('allows route-served workspace icons as images', () => {
        const policy = buildCspPolicy('prod');
        const imageSrc = policy['img-src'] ?? [];

        expect(imageSrc).toContain('neon-workspace-icon:');
    });
});
