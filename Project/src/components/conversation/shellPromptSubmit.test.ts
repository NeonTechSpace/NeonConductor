import { describe, expect, it, vi } from 'vitest';

import { submitPrompt } from '@/web/components/conversation/shell/actions/promptSubmit';
import { DEFAULT_RUN_OPTIONS } from '@/web/components/conversation/shell/workspace/helpers';

import { kiloFrontierModelId } from '@/shared/kiloModels';

describe('submitPrompt', () => {
    it('starts plan mode and clears prompt state on success', async () => {
        const startPlan = vi.fn().mockResolvedValue({});
        const onPromptCleared = vi.fn();
        const onPlanStarted = vi.fn();
        const startRun = vi.fn();

        await submitPrompt({
            prompt: '  Build a plan  ',
            isStartingRun: false,
            selectedSessionId: 'sess_test',
            isPlanningMode: true,
            profileId: 'profile_default',
            topLevelTab: 'agent',
            modeKey: 'plan',
            workspaceFingerprint: 'wsf_test',
            resolvedRunTarget: undefined,
            runtimeOptions: DEFAULT_RUN_OPTIONS,
            providerById: new Map(),
            startPlan,
            startRun,
            onPromptCleared,
            onPlanStarted,
            onRunStarted: vi.fn(),
            onError: vi.fn(),
        });

        expect(startPlan).toHaveBeenCalledWith({
            profileId: 'profile_default',
            sessionId: 'sess_test',
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Build a plan',
            workspaceFingerprint: 'wsf_test',
        });
        expect(startRun).not.toHaveBeenCalled();
        expect(onPromptCleared).toHaveBeenCalledOnce();
        expect(onPlanStarted).toHaveBeenCalledOnce();
    });

    it('returns actionable provider auth errors for run mode', async () => {
        const onError = vi.fn();

        await submitPrompt({
            prompt: 'Ship it',
            isStartingRun: false,
            selectedSessionId: 'sess_test',
            isPlanningMode: false,
            profileId: 'profile_default',
            topLevelTab: 'chat',
            modeKey: 'chat',
            workspaceFingerprint: undefined,
            resolvedRunTarget: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            runtimeOptions: DEFAULT_RUN_OPTIONS,
            providerById: new Map([
                [
                    'openai',
                    {
                        label: 'OpenAI',
                        authState: 'logged_out',
                        authMethod: 'api_key',
                    },
                ],
            ]),
            startPlan: vi.fn(),
            startRun: vi.fn(),
            onPromptCleared: vi.fn(),
            onPlanStarted: vi.fn(),
            onRunStarted: vi.fn(),
            onError,
        });

        expect(onError).toHaveBeenCalledWith(
            'OpenAI is not authenticated. Open Settings > Providers and connect it before running.'
        );
    });

    it('routes Kilo auth errors to the Kilo settings surface', async () => {
        const onError = vi.fn();

        await submitPrompt({
            prompt: 'Ship it',
            isStartingRun: false,
            selectedSessionId: 'sess_test',
            isPlanningMode: false,
            profileId: 'profile_default',
            topLevelTab: 'chat',
            modeKey: 'chat',
            workspaceFingerprint: undefined,
            resolvedRunTarget: {
                providerId: 'kilo',
                modelId: kiloFrontierModelId,
            },
            runtimeOptions: DEFAULT_RUN_OPTIONS,
            providerById: new Map([
                [
                    'kilo',
                    {
                        label: 'Kilo',
                        authState: 'logged_out',
                        authMethod: 'device_code',
                    },
                ],
            ]),
            startPlan: vi.fn(),
            startRun: vi.fn(),
            onPromptCleared: vi.fn(),
            onPlanStarted: vi.fn(),
            onRunStarted: vi.fn(),
            onError,
        });

        expect(onError).toHaveBeenCalledWith(
            'Kilo is not authenticated. Open Settings > Kilo and sign in before running.'
        );
    });

    it('submits ready image attachments for executable runs', async () => {
        const startRun = vi.fn().mockResolvedValue({
            accepted: true,
            runId: 'run_test',
            runStatus: 'running',
            run: {
                id: 'run_test',
                sessionId: 'sess_test',
                profileId: 'profile_default',
                prompt: '',
                status: 'running',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                authMethod: 'api_key',
                createdAt: '2026-03-10T00:00:00.000Z',
                updatedAt: '2026-03-10T00:00:00.000Z',
            },
            session: {
                id: 'sess_test',
                profileId: 'profile_default',
                conversationId: 'conv_test',
                threadId: 'thr_test',
                kind: 'local',
                runStatus: 'running',
                turnCount: 1,
                createdAt: '2026-03-10T00:00:00.000Z',
                updatedAt: '2026-03-10T00:00:00.000Z',
            },
            initialMessages: {
                messages: [],
                messageParts: [],
            },
        });
        const onPromptCleared = vi.fn();
        const onRunStarted = vi.fn();

        await submitPrompt({
            prompt: '',
            attachments: [
                {
                    clientId: 'img-1',
                    mimeType: 'image/png',
                    bytesBase64: 'abc123',
                    width: 1,
                    height: 1,
                    sha256: 'hash-1',
                },
            ],
            isStartingRun: false,
            selectedSessionId: 'sess_test',
            isPlanningMode: false,
            profileId: 'profile_default',
            topLevelTab: 'chat',
            modeKey: 'chat',
            workspaceFingerprint: undefined,
            resolvedRunTarget: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            runtimeOptions: DEFAULT_RUN_OPTIONS,
            providerById: new Map([
                [
                    'openai',
                    {
                        label: 'OpenAI',
                        authState: 'configured',
                        authMethod: 'api_key',
                    },
                ],
            ]),
            startPlan: vi.fn(),
            startRun,
            onPromptCleared,
            onPlanStarted: vi.fn(),
            onRunStarted,
            onError: vi.fn(),
        });

        expect(startRun).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: '',
                attachments: [
                    expect.objectContaining({
                        clientId: 'img-1',
                        mimeType: 'image/png',
                    }),
                ],
            })
        );
        expect(onPromptCleared).toHaveBeenCalledOnce();
        expect(onRunStarted).toHaveBeenCalledOnce();
    });

    it('notifies optimistic run lifecycle callbacks around run submission', async () => {
        const onRunStartRequested = vi.fn();
        const onRunStartFinished = vi.fn();

        await submitPrompt({
            prompt: 'Ship it',
            isStartingRun: false,
            selectedSessionId: 'sess_test',
            isPlanningMode: false,
            profileId: 'profile_default',
            topLevelTab: 'chat',
            modeKey: 'chat',
            workspaceFingerprint: undefined,
            resolvedRunTarget: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            runtimeOptions: DEFAULT_RUN_OPTIONS,
            providerById: new Map([
                [
                    'openai',
                    {
                        label: 'OpenAI',
                        authState: 'configured',
                        authMethod: 'api_key',
                    },
                ],
            ]),
            startPlan: vi.fn(),
            startRun: vi.fn().mockResolvedValue({
                accepted: false,
                message: 'Nope',
            }),
            onPromptCleared: vi.fn(),
            onPlanStarted: vi.fn(),
            onRunStarted: vi.fn(),
            onRunStartRequested,
            onRunStartFinished,
            onError: vi.fn(),
        });

        expect(onRunStartRequested).toHaveBeenCalledWith({
            sessionId: 'sess_test',
            prompt: 'Ship it',
        });
        expect(onRunStartFinished).toHaveBeenCalledOnce();
    });

    it('formats typed rejected run-start actions without parsing backend messages', async () => {
        const onError = vi.fn();

        await submitPrompt({
            prompt: 'Describe this image',
            attachments: [
                {
                    clientId: 'img-1',
                    mimeType: 'image/png',
                    bytesBase64: 'abc123',
                    width: 1,
                    height: 1,
                    sha256: 'hash-1',
                },
            ],
            isStartingRun: false,
            selectedSessionId: 'sess_test',
            isPlanningMode: false,
            profileId: 'profile_default',
            topLevelTab: 'chat',
            modeKey: 'chat',
            workspaceFingerprint: undefined,
            resolvedRunTarget: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            runtimeOptions: DEFAULT_RUN_OPTIONS,
            providerById: new Map([
                [
                    'openai',
                    {
                        label: 'OpenAI',
                        authState: 'configured',
                        authMethod: 'api_key',
                    },
                ],
            ]),
            startPlan: vi.fn(),
            startRun: vi.fn().mockResolvedValue({
                accepted: false,
                message: 'backend message should not be substring-parsed',
                action: {
                    code: 'model_vision_required',
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
            }),
            onPromptCleared: vi.fn(),
            onPlanStarted: vi.fn(),
            onRunStarted: vi.fn(),
            onError,
        });

        expect(onError).toHaveBeenCalledWith(
            'Selected model does not support image input. Choose a vision-capable model or remove the attached images.'
        );
    });
});
