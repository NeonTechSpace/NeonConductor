import { describe, expect, it } from 'vitest';

import { decodeCommandOutput } from '@/app/backend/runtime/services/toolExecution/handlers/commandOutputDecoder';

describe('commandOutputDecoder', () => {
    it('keeps valid utf8 output unchanged', () => {
        const buffer = Buffer.from('hello world', 'utf8');

        expect(decodeCommandOutput(buffer, 'win32')).toBe('hello world');
    });

    it('decodes Windows-1252 punctuation cases', () => {
        const buffer = Buffer.from([
            0x93, 0x71, 0x75, 0x6f, 0x74, 0x65, 0x64, 0x94, 0x20, 0x74, 0x65, 0x73, 0x74, 0x20, 0x97, 0x20, 0x76, 0x61,
            0x6c, 0x75, 0x65,
        ]);

        expect(decodeCommandOutput(buffer, 'win32')).toBe('“quoted” test — value');
    });

    it('decodes CP1251 text', () => {
        const buffer = Buffer.from([
            0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x20, 0xe8, 0xe7, 0x20, 0x50, 0x6f, 0x77, 0x65, 0x72, 0x53, 0x68, 0x65,
            0x6c, 0x6c,
        ]);

        expect(decodeCommandOutput(buffer, 'win32')).toBe('Привет из PowerShell');
    });

    it('decodes CP866 text', () => {
        const buffer = Buffer.from([0x8f, 0xe0, 0xa8, 0xa2, 0xa5, 0xe2, 0x20, 0xa8, 0xa7, 0x20, 0x63, 0x6d, 0x64]);

        expect(decodeCommandOutput(buffer, 'win32')).toBe('Привет из cmd');
    });
});
