import { describe, expect, it } from 'vitest';

import { readRuntimeProviderId } from '@/web/components/conversation/panels/composerActionPanel/ComposerRunControlsBar';

describe('readRuntimeProviderId', () => {
    it('returns the provider id when the input is a known runtime provider', () => {
        expect(readRuntimeProviderId('kilo')).toBe('kilo');
        expect(readRuntimeProviderId('openai_codex')).toBe('openai_codex');
    });

    it('returns undefined for unknown or missing provider ids', () => {
        expect(readRuntimeProviderId('anthropic')).toBeUndefined();
        expect(readRuntimeProviderId(undefined)).toBeUndefined();
    });
});
