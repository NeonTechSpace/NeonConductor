import { Children } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { MarkdownCodeBlock } from '@/web/components/content/markdown/markdownCodeBlock';
import { cn } from '@/web/lib/utils';

import type { Components } from 'react-markdown';

interface MarkdownContentProps {
    markdown: string;
    className?: string;
}

function readCodeValue(children: React.ReactNode): string {
    return Children.toArray(children)
        .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
        .join('')
        .replace(/\n$/, '');
}

const markdownComponents: Components = {
    a: ({ className, ...props }) => (
        <a
            {...props}
            className={cn(
                'text-primary decoration-primary/35 hover:decoration-primary underline underline-offset-3',
                className
            )}
            rel='noreferrer'
            target='_blank'
        />
    ),
    blockquote: ({ className, ...props }) => (
        <blockquote
            {...props}
            className={cn('border-primary/35 text-muted-foreground border-l-3 pl-4 italic', className)}
        />
    ),
    code: ({ children, className, ...props }) => {
        const value = readCodeValue(children);
        const languageMatch = /language-([\w-]+)/.exec(className ?? '');
        const language = languageMatch?.[1];
        const isInline = !language && !value.includes('\n');

        if (isInline) {
            return (
                <code
                    {...props}
                    className='border-border bg-background/80 text-foreground rounded px-1.5 py-0.5 font-mono text-[0.92em]'>
                    {value}
                </code>
            );
        }

        return <MarkdownCodeBlock code={value} {...(language ? { language } : {})} />;
    },
    h1: ({ className, ...props }) => <h1 {...props} className={cn('text-base font-semibold', className)} />,
    h2: ({ className, ...props }) => <h2 {...props} className={cn('text-sm font-semibold', className)} />,
    h3: ({ className, ...props }) => (
        <h3 {...props} className={cn('text-xs font-semibold tracking-[0.08em] uppercase', className)} />
    ),
    hr: ({ className, ...props }) => <hr {...props} className={cn('border-border my-4', className)} />,
    li: ({ className, ...props }) => <li {...props} className={cn('break-words', className)} />,
    ol: ({ className, ...props }) => <ol {...props} className={cn('list-decimal space-y-2 pl-5', className)} />,
    p: ({ className, ...props }) => (
        <p {...props} className={cn('text-sm leading-7 break-words whitespace-pre-wrap', className)} />
    ),
    pre: ({ children }) => children,
    table: ({ className, ...props }) => (
        <div className='overflow-x-auto'>
            <table {...props} className={cn('markdown-table w-full border-collapse text-sm', className)} />
        </div>
    ),
    tbody: ({ className, ...props }) => <tbody {...props} className={cn('divide-border divide-y', className)} />,
    td: ({ className, ...props }) => (
        <td {...props} className={cn('border-border border px-3 py-2 align-top', className)} />
    ),
    th: ({ className, ...props }) => (
        <th
            {...props}
            className={cn('border-border bg-background/70 border px-3 py-2 text-left font-semibold', className)}
        />
    ),
    thead: ({ className, ...props }) => <thead {...props} className={cn('border-border border-b', className)} />,
    tr: ({ className, ...props }) => <tr {...props} className={cn('align-top', className)} />,
    ul: ({ className, ...props }) => <ul {...props} className={cn('list-disc space-y-2 pl-5', className)} />,
};

export function MarkdownContent({ markdown, className }: MarkdownContentProps) {
    return (
        <div className={cn('markdown-content space-y-3', className)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {markdown}
            </ReactMarkdown>
        </div>
    );
}
