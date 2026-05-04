import { useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import type {
    ToolArtifactKind,
    ToolArtifactPreviewStrategy,
} from '@/web/components/conversation/messages/toolArtifactFormatting';
import { ToolArtifactPreviewCard } from '@/web/components/conversation/messages/toolArtifactPreviewCard';
import { WorkbenchRowShell } from '@/web/components/conversation/messages/workbenchRowPrimitives';
import type {
    WorkbenchTimelineIconToken,
    WorkbenchTimelineItemSeverity,
    WorkbenchTimelineItemStatus,
} from '@/web/components/conversation/messages/workbenchTimelineModel';
import { Button } from '@/web/components/ui/button';
import { copyText } from '@/web/lib/copy';

import type { EntityId } from '@/shared/contracts';

export interface WorkbenchToolCallRowItem {
    id: string;
    text: string;
    displayLabel?: string;
    workbenchItemId?: string;
    status?: WorkbenchTimelineItemStatus;
    severity?: WorkbenchTimelineItemSeverity;
    icon?: WorkbenchTimelineIconToken;
    title?: string;
    summary?: string;
    defaultCollapsed?: boolean;
}

export interface WorkbenchToolResultRowItem {
    id: string;
    text: string;
    workbenchItemId?: string;
    workbenchKind?: 'command' | 'artifact';
    status?: WorkbenchTimelineItemStatus;
    severity?: WorkbenchTimelineItemSeverity;
    icon?: WorkbenchTimelineIconToken;
    title?: string;
    summary?: string;
    defaultCollapsed?: boolean;
    messagePartId: EntityId<'part'>;
    toolName: string;
    artifactized: boolean;
    artifactAvailable: boolean;
    artifactKind?: ToolArtifactKind;
    previewStrategy?: ToolArtifactPreviewStrategy;
    totalBytes?: number;
    totalLines?: number;
    omittedBytes?: number;
    summaryMode?: 'deterministic' | 'utility_ai';
}

function firstPreviewLine(text: string): string {
    const firstLine = text.split('\n')[0]?.trim();
    return firstLine && firstLine.length > 0 ? firstLine : 'No preview text available.';
}

export function WorkbenchToolCallRow({ item }: { item: WorkbenchToolCallRowItem }) {
    return (
        <WorkbenchRowShell
            id={item.workbenchItemId ?? item.id}
            icon={item.icon ?? 'tool'}
            severity={item.severity ?? 'neutral'}
            title={item.title ?? item.displayLabel ?? 'Tool Call'}
            defaultCollapsed={item.defaultCollapsed ?? true}
            {...((item.summary ?? item.displayLabel) ? { summary: item.summary ?? item.displayLabel } : {})}>
            {item.text.trim().length > 0 ? (
                <MarkdownContent markdown={item.text} />
            ) : (
                <p className='text-muted-foreground'>No tool input was recorded.</p>
            )}
        </WorkbenchRowShell>
    );
}

export function WorkbenchToolResultRow({
    item,
    onOpenToolArtifact,
}: {
    item: WorkbenchToolResultRowItem;
    onOpenToolArtifact?: (messagePartId: EntityId<'part'>) => void;
}) {
    const [copyFeedback, setCopyFeedback] = useState<string | undefined>(undefined);
    const isCommand = item.workbenchKind === 'command' || item.artifactKind === 'command_output';
    const title = item.title ?? (isCommand ? `Command: ${item.toolName}` : `Tool Result: ${item.toolName}`);
    const summary = item.summary ?? firstPreviewLine(item.text);

    return (
        <WorkbenchRowShell
            id={item.workbenchItemId ?? item.id}
            icon={item.icon ?? (isCommand ? 'terminal' : 'artifact')}
            severity={item.severity ?? 'neutral'}
            title={title}
            summary={summary}
            defaultCollapsed={item.defaultCollapsed ?? true}
            meta={copyFeedback ? <span>{copyFeedback}</span> : null}>
            <div className='space-y-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='min-w-0'>
                        <p className='font-medium'>{item.toolName}</p>
                        <p className='text-muted-foreground'>
                            {isCommand ? 'Command output preview' : 'Tool result preview'}
                        </p>
                    </div>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() => {
                            void copyText(item.text).then((copied) => {
                                setCopyFeedback(copied ? 'Copied' : 'Copy failed');
                                window.setTimeout(() => {
                                    setCopyFeedback(undefined);
                                }, 1400);
                            });
                        }}>
                        Copy preview
                    </Button>
                </div>
                {isCommand ? (
                    <pre className='bg-card/60 border-border/70 text-foreground max-h-72 overflow-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap'>
                        {item.text}
                    </pre>
                ) : (
                    <MarkdownContent markdown={item.text} />
                )}
                {item.artifactAvailable && item.artifactKind && onOpenToolArtifact ? (
                    <ToolArtifactPreviewCard
                        artifactKind={item.artifactKind}
                        {...(item.totalBytes !== undefined ? { totalBytes: item.totalBytes } : {})}
                        {...(item.totalLines !== undefined ? { totalLines: item.totalLines } : {})}
                        {...(item.omittedBytes !== undefined ? { omittedBytes: item.omittedBytes } : {})}
                        {...(item.summaryMode ? { summaryMode: item.summaryMode } : {})}
                        onOpen={() => {
                            onOpenToolArtifact(item.messagePartId);
                        }}
                    />
                ) : null}
            </div>
        </WorkbenchRowShell>
    );
}
