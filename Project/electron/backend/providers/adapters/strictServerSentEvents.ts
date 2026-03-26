import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';

export interface StrictServerSentEventFrame {
    eventName?: string;
    data: string;
}

export function parseStrictServerSentEventFrame(input: {
    frame: string;
    sourceLabel: string;
}): ProviderAdapterResult<StrictServerSentEventFrame | null> {
    let eventName: string | undefined;
    const dataLines: string[] = [];

    for (const line of input.frame.split('\n')) {
        if (line.length === 0) {
            continue;
        }

        if (line.startsWith(':')) {
            continue;
        }

        if (line.startsWith('event:')) {
            eventName = line.slice('event:'.length).trim();
            continue;
        }

        if (line.startsWith('data:')) {
            dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
            continue;
        }

        if (line.startsWith('id:') || line.startsWith('retry:')) {
            continue;
        }

        return errProviderAdapter('invalid_payload', `${input.sourceLabel} contained malformed SSE line "${line}".`);
    }

    if (dataLines.length === 0) {
        return okProviderAdapter(null);
    }

    return okProviderAdapter({
        ...(eventName ? { eventName } : {}),
        data: dataLines.join('\n'),
    });
}

export async function consumeStrictServerSentEvents(input: {
    response: Response;
    sourceLabel: string;
    onFrame: (frame: StrictServerSentEventFrame) => Promise<ProviderAdapterResult<boolean>>;
}): Promise<ProviderAdapterResult<void>> {
    try {
        const stream = input.response.body;
        if (!stream) {
            return errProviderAdapter('provider_request_failed', 'Streaming response body was not available.');
        }

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';

            for (const frame of frames) {
                const parsedFrame = parseStrictServerSentEventFrame({
                    frame,
                    sourceLabel: input.sourceLabel,
                });
                if (parsedFrame.isErr()) {
                    return errProviderAdapter(parsedFrame.error.code, parsedFrame.error.message);
                }

                if (!parsedFrame.value) {
                    continue;
                }

                const frameResult = await input.onFrame(parsedFrame.value);
                if (frameResult.isErr()) {
                    return errProviderAdapter(frameResult.error.code, frameResult.error.message);
                }

                if (frameResult.value) {
                    return okProviderAdapter(undefined);
                }
            }

            if (done) {
                break;
            }
        }

        const trailingFrame = parseStrictServerSentEventFrame({
            frame: buffer,
            sourceLabel: input.sourceLabel,
        });
        if (trailingFrame.isErr()) {
            return errProviderAdapter(trailingFrame.error.code, trailingFrame.error.message);
        }

        if (trailingFrame.value) {
            const trailingResult = await input.onFrame(trailingFrame.value);
            if (trailingResult.isErr()) {
                return errProviderAdapter(trailingResult.error.code, trailingResult.error.message);
            }
        }

        return okProviderAdapter(undefined);
    } catch (error) {
        return errProviderAdapter(
            'provider_request_failed',
            error instanceof Error ? error.message : 'Streaming response parsing failed.'
        );
    }
}
