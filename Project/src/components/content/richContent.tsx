import type {
    RichContentBlock,
    RichContentCodeLine,
    RichContentInlineSegment,
    RichContentToken,
} from '@/web/components/content/richContentModel';
import { cn } from '@/web/lib/utils';

import type { ReactNode } from 'react';


interface RichContentBlocksProps {
    blocks: RichContentBlock[];
    className?: string;
}

function tokenClassName(kind: RichContentToken['kind']): string {
    if (kind === 'keyword') {
        return 'message-token-keyword';
    }

    if (kind === 'string') {
        return 'message-token-string';
    }

    if (kind === 'number') {
        return 'message-token-number';
    }

    if (kind === 'comment') {
        return 'message-token-comment';
    }

    if (kind === 'operator') {
        return 'message-token-operator';
    }

    return '';
}

function InlineSegments({ segments }: { segments: RichContentInlineSegment[] }): ReactNode {
    return segments.map((segment, segmentIndex) =>
        segment.kind === 'inline_code' ? (
            <code
                key={`segment:${String(segmentIndex)}`}
                className='border-border bg-background/80 text-foreground rounded px-1.5 py-0.5 font-mono text-[0.92em]'>
                {segment.text}
            </code>
        ) : (
            <span key={`segment:${String(segmentIndex)}`}>{segment.text}</span>
        )
    );
}

function CodeLine({ line }: { line: RichContentCodeLine }): ReactNode {
    return (
        <div className='message-code-line'>
            <span className='message-code-line-number text-[11px]'>{String(line.lineNumber)}</span>
            <span>
                {line.tokens.map((token, index) => (
                    <span key={`${String(line.lineNumber)}:${String(index)}`} className={tokenClassName(token.kind)}>
                        {token.text}
                    </span>
                ))}
            </span>
        </div>
    );
}

export function RichContentBlocks({ blocks, className }: RichContentBlocksProps): ReactNode {
    return (
        <div className={cn('space-y-3', className)}>
            {blocks.map((block, index) => {
                if (block.kind === 'paragraph') {
                    return (
                        <p key={`paragraph:${String(index)}`} className='text-sm leading-7 whitespace-pre-wrap break-words'>
                            <InlineSegments segments={block.segments} />
                        </p>
                    );
                }

                if (block.kind === 'heading') {
                    const headingClassName =
                        block.level === 1
                            ? 'text-base font-semibold'
                            : block.level === 2
                              ? 'text-sm font-semibold'
                              : 'text-xs font-semibold tracking-[0.08em] uppercase';

                    return (
                        <p key={`heading:${String(index)}`} className={headingClassName}>
                            <InlineSegments segments={block.segments} />
                        </p>
                    );
                }

                if (block.kind === 'list') {
                    return (
                        <ul key={`list:${String(index)}`} className='space-y-2 pl-5 text-sm leading-6 list-disc'>
                            {block.items.map((item, itemIndex) => (
                                <li key={`list-item:${String(itemIndex)}`} className='break-words'>
                                    <InlineSegments segments={item.segments} />
                                </li>
                            ))}
                        </ul>
                    );
                }

                return (
                    <section
                        key={`code:${String(index)}`}
                        className='message-code-surface border-border overflow-hidden rounded-xl border shadow-sm'>
                        <header className='border-border bg-background/80 flex min-h-10 items-center justify-between border-b px-3'>
                            <span className='text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                {block.language ?? 'code'}
                            </span>
                            <span className='text-muted-foreground text-[11px]'>
                                {String(block.lines.length)} {block.lines.length === 1 ? 'line' : 'lines'}
                            </span>
                        </header>
                        <div className='overflow-x-auto px-3 py-3'>
                            <pre className='m-0 font-mono text-[12px] leading-6'>
                                <code className={cn('block min-w-max whitespace-pre')}>
                                    {block.lines.map((line) => (
                                        <CodeLine key={`line:${String(line.lineNumber)}`} line={line} />
                                    ))}
                                </code>
                            </pre>
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
