import { describe, expect, it } from 'vitest';

import { prepareComposerTextFileAttachment } from '@/web/components/conversation/hooks/composerTextFileAttachments';

import { resolveFileReadGuardPolicy } from '@/shared/fileReadGuardPolicy';

describe('prepareComposerTextFileAttachment', () => {
    it('blocks secret-like text files before preparing attachment content', async () => {
        const file = new File(['API_KEY=value'], '.env', { type: 'text/plain' });
        const result = await prepareComposerTextFileAttachment(
            file,
            'client_1',
            resolveFileReadGuardPolicy(undefined)
        );

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected .env to be blocked by the file read guard.');
        }
        expect(result.error.message).toContain('secret or credential');
    });

    it('prepares default allowed UTF-8 source files', async () => {
        const file = new File(['const value = 1;\n'], 'example.ts', { type: 'text/typescript' });
        const result = await prepareComposerTextFileAttachment(
            file,
            'client_2',
            resolveFileReadGuardPolicy(undefined)
        );

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.attachment).toMatchObject({
            kind: 'text_file_attachment',
            fileName: 'example.ts',
            text: 'const value = 1;\n',
        });
    });
});

