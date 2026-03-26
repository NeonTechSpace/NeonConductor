import { useContext, useEffect, useState } from 'react';

import { highlightMarkdownCode } from '@/web/components/content/markdown/shikiHighlighter';
import { ThemeContext } from '@/web/lib/theme/themeContext';
import { cn } from '@/web/lib/utils';

interface MarkdownCodeBlockProps {
    code: string;
    language?: string;
    className?: string;
}

export async function resolveHighlightedMarkdownCode(input: {
    code: string;
    theme: 'light' | 'dark';
    language?: string;
}): Promise<string | null> {
    try {
        return await highlightMarkdownCode(input);
    } catch {
        return null;
    }
}

export function MarkdownCodeBlock({ code, language, className }: MarkdownCodeBlockProps) {
    const themeContext = useContext(ThemeContext);
    const resolvedTheme = themeContext?.resolvedTheme ?? 'light';
    const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setHighlightedHtml(null);

        const loadHighlight = async () => {
            const html = await resolveHighlightedMarkdownCode({
                code,
                theme: resolvedTheme,
                ...(language ? { language } : {}),
            });
            if (cancelled) {
                return;
            }

            setHighlightedHtml(html);
        };

        void loadHighlight();

        return () => {
            cancelled = true;
        };
    }, [code, language, resolvedTheme]);

    return (
        <section
            className={cn(
                'markdown-code-surface border-border overflow-hidden rounded-xl border shadow-sm',
                className
            )}>
            <header className='border-border bg-background/80 flex min-h-10 items-center justify-between gap-3 border-b px-3'>
                <span className='text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.12em] uppercase'>
                    {language ?? 'code'}
                </span>
                <span className='text-muted-foreground text-[11px]'>
                    {String(code.split('\n').length)} {code.includes('\n') ? 'lines' : 'line'}
                </span>
            </header>
            <div className='overflow-x-auto px-3 py-3'>
                {highlightedHtml ? (
                    <div
                        className='markdown-shiki text-[12px] leading-6'
                        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                ) : (
                    <pre className='m-0 overflow-x-auto font-mono text-[12px] leading-6 whitespace-pre'>
                        <code>{code}</code>
                    </pre>
                )}
            </div>
        </section>
    );
}
