import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MessageTimelineItem } from '@/web/components/conversation/messages/messageTimeline';

describe('message timeline assistant placeholders', () => {
    it('shows an assistant lifecycle row before output arrives', () => {
        const html = renderToStaticMarkup(
            <MessageTimelineItem
                profileId='profile_default'
                entry={{
                    id: 'msg_assistant',
                    runId: 'run_default',
                    role: 'assistant',
                    createdAt: '2026-03-12T09:00:00.000Z',
                    body: [
                        {
                            id: 'part_status',
                            workbenchItemId: 'msg_assistant:part_status:status',
                            type: 'assistant_status',
                            code: 'received',
                            label: 'Agent received message',
                            status: 'running',
                            severity: 'info',
                            icon: 'activity',
                            title: 'Agent received message',
                            defaultCollapsed: false,
                            summary: 'Agent received message',
                            elapsedMs: 1250,
                        },
                    ],
                }}
                runStatus='running'
                canBranch={false}
            />
        );

        expect(html).toContain('Agent received message');
        expect(html).toContain('aria-expanded="true"');
        expect(html).toContain('aria-controls="msg_assistant:part_status:status-details"');
        expect(html).toContain('role="region"');
        expect(html).toContain('motion-safe:animate-pulse');
        expect(html).toContain('motion-reduce:animate-none');
        expect(html).toContain('1.3 s');
    });

    it('renders failed assistant lifecycle rows as expanded error rows without a running pulse', () => {
        const html = renderToStaticMarkup(
            <MessageTimelineItem
                profileId='profile_default'
                entry={{
                    id: 'msg_assistant',
                    runId: 'run_default',
                    role: 'assistant',
                    createdAt: '2026-03-12T09:00:00.000Z',
                    body: [
                        {
                            id: 'part_status',
                            workbenchItemId: 'msg_assistant:part_status:error',
                            type: 'assistant_status',
                            code: 'failed_before_output',
                            label: 'Run failed before output',
                            status: 'failed',
                            severity: 'error',
                            icon: 'error',
                            title: 'Assistant failed before output',
                            defaultCollapsed: false,
                            summary: 'Run failed before output',
                        },
                    ],
                }}
                runStatus='error'
                canBranch={false}
            />
        );

        expect(html).toContain('Assistant failed before output');
        expect(html).toContain('Run failed before output');
        expect(html).toContain('aria-expanded="true"');
        expect(html).toContain('text-destructive');
        expect(html).not.toContain('motion-safe:animate-pulse');
    });

    it('shows a concrete failure message when a run ends before assistant output arrives', () => {
        const html = renderToStaticMarkup(
            <MessageTimelineItem
                profileId='profile_default'
                entry={{
                    id: 'msg_assistant',
                    runId: 'run_default',
                    role: 'assistant',
                    createdAt: '2026-03-12T09:00:00.000Z',
                    body: [],
                }}
                runStatus='error'
                runErrorMessage='Provider stream dropped.'
                canBranch={false}
            />
        );

        expect(html).toContain('Run failed before any assistant output was recorded.');
        expect(html).toContain('Provider stream dropped.');
    });

    it('shows a sending affordance for optimistic user entries', () => {
        const html = renderToStaticMarkup(
            <MessageTimelineItem
                profileId='profile_default'
                entry={{
                    id: 'msg_user_sending',
                    runId: 'optimistic_run',
                    role: 'user',
                    createdAt: '2026-03-12T09:00:00.000Z',
                    body: [
                        {
                            id: 'part_user_text',
                            type: 'user_text',
                            text: 'Ship it',
                            providerLimitedReasoning: false,
                        },
                    ],
                    plainCopyText: 'Ship it',
                    rawCopyText: 'Ship it',
                    editableText: 'Ship it',
                    deliveryState: 'sending',
                    isOptimistic: true,
                }}
                canBranch={false}
            />
        );

        expect(html).toContain('Ship it');
        expect(html).toContain('Sending...');
    });
});
