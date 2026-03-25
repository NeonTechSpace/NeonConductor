import { Buffer } from 'node:buffer';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeMessageListener = (data: string) => void;
type FakeOpenListener = () => void;
type FakeCloseListener = (code: number, reason: Buffer) => void;
type FakeErrorListener = (error: Error) => void;

const { FakeWebSocket } = vi.hoisted(() => {
    class HoistedFakeWebSocket {
        static readonly OPEN = 1;
        static readonly CONNECTING = 0;
        static instances: HoistedFakeWebSocket[] = [];

        readonly url: string;
        readonly options: { headers?: Record<string, string> };
        readyState = HoistedFakeWebSocket.CONNECTING;
        readonly sent: string[] = [];
        closed = false;

        private readonly openListeners = new Set<FakeOpenListener>();
        private readonly messageListeners = new Set<FakeMessageListener>();
        private readonly closeListeners = new Set<FakeCloseListener>();
        private readonly errorListeners = new Set<FakeErrorListener>();

        constructor(url: string, options: { headers?: Record<string, string> }) {
            this.url = url;
            this.options = options;
            HoistedFakeWebSocket.instances.push(this);
        }

        on(event: 'open' | 'message' | 'close' | 'error', listener: FakeOpenListener | FakeMessageListener | FakeCloseListener | FakeErrorListener) {
            if (event === 'open') {
                this.openListeners.add(listener as FakeOpenListener);
                return;
            }
            if (event === 'message') {
                this.messageListeners.add(listener as FakeMessageListener);
                return;
            }
            if (event === 'close') {
                this.closeListeners.add(listener as FakeCloseListener);
                return;
            }

            this.errorListeners.add(listener as FakeErrorListener);
        }

        off(event: 'open' | 'message' | 'close' | 'error', listener: FakeOpenListener | FakeMessageListener | FakeCloseListener | FakeErrorListener) {
            if (event === 'open') {
                this.openListeners.delete(listener as FakeOpenListener);
                return;
            }
            if (event === 'message') {
                this.messageListeners.delete(listener as FakeMessageListener);
                return;
            }
            if (event === 'close') {
                this.closeListeners.delete(listener as FakeCloseListener);
                return;
            }

            this.errorListeners.delete(listener as FakeErrorListener);
        }

        send(payload: string) {
            this.sent.push(payload);
        }

        close() {
            this.closed = true;
            this.readyState = 3;
        }

        emitOpen() {
            this.readyState = HoistedFakeWebSocket.OPEN;
            for (const listener of this.openListeners) {
                listener();
            }
        }

        emitMessage(payload: Record<string, unknown>) {
            const serialized = JSON.stringify(payload);
            for (const listener of this.messageListeners) {
                listener(serialized);
            }
        }
    }

    return {
        FakeWebSocket: HoistedFakeWebSocket,
    };
});

vi.mock('ws', () => ({
    default: FakeWebSocket,
}));

import { streamOpenAIRealtimeWebSocketRuntime } from '@/app/backend/providers/adapters/openaiCompatible/realtimeWebsocket';

describe('streamOpenAIRealtimeWebSocketRuntime', () => {
    beforeEach(() => {
        FakeWebSocket.instances = [];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('opens the backend websocket, seeds the conversation, and streams text/tool calls', async () => {
        const onPart = vi.fn();
        const onUsage = vi.fn();

        const executionPromise = streamOpenAIRealtimeWebSocketRuntime({
            runtimeInput: {
                profileId: 'profile_default',
                sessionId: 'sess_test',
                runId: 'run_test',
                providerId: 'openai',
                modelId: 'openai/gpt-realtime',
                runtime: {
                    toolProtocol: 'openai_responses',
                    apiFamily: 'openai_compatible',
                },
                promptText: 'Use the filesystem tool',
                contextMessages: [
                    {
                        role: 'user',
                        parts: [{ type: 'text', text: 'Use the filesystem tool' }],
                    },
                ],
                tools: [
                    {
                        id: 'read_file',
                        description: 'Read a file',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                path: { type: 'string' },
                            },
                            required: ['path'],
                        },
                    },
                ],
                toolChoice: 'auto',
                cache: {
                    strategy: 'auto',
                    applied: false,
                },
                authMethod: 'api_key',
                apiKey: 'openai-test-key',
                signal: new AbortController().signal,
                runtimeOptions: {
                    reasoning: {
                        effort: 'none',
                        summary: 'none',
                        includeEncrypted: false,
                    },
                    cache: {
                        strategy: 'auto',
                    },
                    transport: {
                        family: 'auto',
                    },
                    execution: {
                        openAIExecutionMode: 'realtime_websocket',
                    },
                },
            },
            handlers: {
                onPart,
                onUsage,
            },
            baseUrl: 'https://api.openai.com/v1',
            token: 'openai-test-key',
            startedAt: Date.now() - 25,
        });

        const socket = FakeWebSocket.instances[0];
        expect(socket).toBeDefined();
        if (!socket) {
            throw new Error('Expected fake websocket instance.');
        }

        expect(socket.url).toBe('wss://api.openai.com/v1/realtime?model=gpt-realtime');
        expect(socket.options.headers).toMatchObject({
            Authorization: 'Bearer openai-test-key',
        });

        socket.emitOpen();

        expect(socket.sent).toHaveLength(3);
        expect(JSON.parse(socket.sent[0] ?? '{}')).toMatchObject({
            type: 'session.update',
            session: {
                modalities: ['text'],
                tool_choice: 'auto',
            },
        });
        expect(JSON.parse(socket.sent[1] ?? '{}')).toMatchObject({
            type: 'conversation.item.create',
            item: {
                type: 'message',
                role: 'user',
            },
        });
        expect(JSON.parse(socket.sent[2] ?? '{}')).toMatchObject({
            type: 'response.create',
            response: {
                modalities: ['text'],
            },
        });

        socket.emitMessage({
            type: 'response.output_text.delta',
            delta: 'Working on it',
        });
        socket.emitMessage({
            type: 'response.output_item.added',
            item: {
                type: 'function_call',
                call_id: 'call_read_file',
                id: 'item_read_file',
                name: 'read_file',
            },
        });
        socket.emitMessage({
            type: 'response.function_call_arguments.delta',
            call_id: 'call_read_file',
            item_id: 'item_read_file',
            delta: '{"path":"README.md"}',
        });
        socket.emitMessage({
            type: 'response.output_item.done',
            item: {
                type: 'function_call',
                call_id: 'call_read_file',
                id: 'item_read_file',
                name: 'read_file',
                arguments: '{"path":"README.md"}',
            },
        });
        socket.emitMessage({
            type: 'response.done',
            response: {
                usage: {
                    input_tokens: 12,
                    output_tokens: 8,
                    total_tokens: 20,
                },
            },
        });

        const result = await executionPromise;
        expect(result.isOk()).toBe(true);
        expect(socket.closed).toBe(true);
        expect(onPart).toHaveBeenNthCalledWith(1, {
            partType: 'text',
            payload: { text: 'Working on it' },
        });
        expect(onPart).toHaveBeenNthCalledWith(2, {
            partType: 'tool_call',
            payload: {
                callId: 'call_read_file',
                toolName: 'read_file',
                argumentsText: '{"path":"README.md"}',
                args: { path: 'README.md' },
            },
        });
        expect(onUsage).toHaveBeenCalledWith(
            expect.objectContaining({
                inputTokens: 12,
                outputTokens: 8,
                totalTokens: 20,
            })
        );
    });

    it('closes cleanly when the run is aborted', async () => {
        const controller = new AbortController();
        const executionPromise = streamOpenAIRealtimeWebSocketRuntime({
            runtimeInput: {
                profileId: 'profile_default',
                sessionId: 'sess_test',
                runId: 'run_test',
                providerId: 'openai',
                modelId: 'openai/gpt-realtime-mini',
                runtime: {
                    toolProtocol: 'openai_responses',
                    apiFamily: 'openai_compatible',
                },
                promptText: 'Abort this run',
                cache: {
                    strategy: 'auto',
                    applied: false,
                },
                authMethod: 'api_key',
                apiKey: 'openai-test-key',
                signal: controller.signal,
                runtimeOptions: {
                    reasoning: {
                        effort: 'none',
                        summary: 'none',
                        includeEncrypted: false,
                    },
                    cache: {
                        strategy: 'auto',
                    },
                    transport: {
                        family: 'auto',
                    },
                    execution: {
                        openAIExecutionMode: 'realtime_websocket',
                    },
                },
            },
            handlers: {
                onPart: vi.fn(),
            },
            baseUrl: 'https://api.openai.com/v1',
            token: 'openai-test-key',
            startedAt: Date.now(),
        });

        const socket = FakeWebSocket.instances[0];
        expect(socket).toBeDefined();
        if (!socket) {
            throw new Error('Expected fake websocket instance.');
        }

        socket.emitOpen();
        controller.abort();

        const result = await executionPromise;
        expect(result.isOk()).toBe(true);
        expect(socket.closed).toBe(true);
    });
});
