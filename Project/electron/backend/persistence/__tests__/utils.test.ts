import { describe, expect, it } from 'vitest';

import {
    isJsonRecord,
    isJsonString,
    isJsonUnknownArray,
    parseJsonValue,
} from '@/app/backend/persistence/stores/shared/utils';

describe('persistence json utils', () => {
    it('returns parsed values only when the guard passes', () => {
        expect(parseJsonValue('{"ok":true}', {}, isJsonRecord)).toEqual({ ok: true });
        expect(parseJsonValue('"openai"', 'fallback', isJsonString)).toBe('openai');
        expect(parseJsonValue('["a"]', [], isJsonUnknownArray)).toEqual(['a']);
    });

    it('falls back for invalid json or mismatched shapes', () => {
        expect(parseJsonValue('not-json', {}, isJsonRecord)).toEqual({});
        expect(parseJsonValue('["array"]', {}, isJsonRecord)).toEqual({});
        expect(parseJsonValue('"text"', [], isJsonUnknownArray)).toEqual([]);
    });
});
