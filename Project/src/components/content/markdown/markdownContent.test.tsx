import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { markdownToPlainText } from '@/web/components/content/markdown/plainText';

describe('markdown content', () => {
    it('renders common agent markdown structures through GFM', () => {
        const html = renderToStaticMarkup(
            <MarkdownContent
                markdown={[
                    '# Summary',
                    '',
                    '> quoted',
                    '',
                    '| File | Status |',
                    '| --- | --- |',
                    '| src/app.ts | modified |',
                    '',
                    '- [x] done',
                    '- [ ] next',
                    '',
                    '```ts',
                    'const total = 7',
                    '```',
                ].join('\n')}
            />
        );

        expect(html).toContain('<h1');
        expect(html).toContain('<blockquote');
        expect(html).toContain('<table');
        expect(html).toContain('type="checkbox"');
        expect(html).toContain('<pre');
    });

    it('escapes raw html instead of rendering it', () => {
        const html = renderToStaticMarkup(<MarkdownContent markdown={'<script>alert("x")</script>'} />);
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    });

    it('converts markdown to readable plain text for copy payloads', () => {
        const plainText = markdownToPlainText(
            [
                '# Plan',
                '',
                '- [x] Ship markdown renderer',
                '- [ ] Polish file summary',
                '',
                '```ts',
                'const total = 7',
                '```',
            ].join('\n')
        );

        expect(plainText).toContain('Plan');
        expect(plainText).toContain('Ship markdown renderer');
        expect(plainText).toContain('const total = 7');
    });
});
