import { describe, expect, it } from 'vitest';

import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';

describe('rowParsers', () => {
    it('parses enum values and rejects invalid values', () => {
        const allowed = ['alpha', 'beta'] as const;
        const parsed = parseEnumValue('alpha', 'mode', allowed);
        expect(parsed).toBe('alpha');

        expect(() => parseEnumValue('gamma', 'mode', allowed)).toThrow('Invalid "mode"');
    });

    it('parses entity ids and rejects invalid prefixes', () => {
        const id = parseEntityId('msg_abc123', 'messageId', 'msg');
        expect(id).toBe('msg_abc123');

        expect(() => parseEntityId('run_abc123', 'messageId', 'msg')).toThrow('expected "msg_..." ID');
    });

    it('parses json records and falls back to empty object for invalid input', () => {
        expect(parseJsonRecord('{"ok":true}')).toEqual({ ok: true });
        expect(parseJsonRecord('["array"]')).toEqual({});
        expect(parseJsonRecord('not-json')).toEqual({});
    });
});
