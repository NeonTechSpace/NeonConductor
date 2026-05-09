import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const controllerTestState = vi.hoisted(() => {
    const invalidateControlPlaneMock = vi.fn().mockResolvedValue(undefined);
    const invalidateShellBootstrapMock = vi.fn().mockResolvedValue(undefined);
    const useQueryMock = vi.fn(() => ({
        data: {
            providerControl: {
                entries: [
                    {
                        provider: {
                            id: 'openai',
                            label: 'OpenAI',
                            authState: 'authenticated',
                            authMethod: 'api_key',
                        },
                        models: [
                            {
                                id: 'openai/gpt-5',
                                label: 'GPT-5',
                                providerId: 'openai',
                            },
                            {
                                id: 'openai/gpt-5-mini',
                                label: 'GPT-5 mini',
                                providerId: 'openai',
                            },
                        ],
                        catalogState: {
                            reason: null,
                            invalidModelCount: 0,
                        },
                    },
                    {
                        provider: {
                            id: 'moonshot',
                            label: 'Moonshot',
                            authState: 'authenticated',
                            authMethod: 'api_key',
                        },
                        models: [
                            {
                                id: 'moonshot/kimi-k2.5',
                                label: 'Kimi K2.5',
                                providerId: 'moonshot',
                            },
                        ],
                        catalogState: {
                            reason: null,
                            invalidModelCount: 0,
                        },
                    },
                ],
                defaults: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
                specialistDefaults: [],
                workflowRoutingPreferences: [
                    {
                        targetKey: 'planning',
                        providerId: 'moonshot',
                        modelId: 'moonshot/kimi-k2.5',
                    },
                ],
            },
        },
        isLoading: false,
        error: undefined,
    }));
    const mutationResult = {
        mutateAsync: vi.fn().mockResolvedValue(undefined),
        isPending: false,
        error: null,
    };
    const mutationConfigs: Array<{
        onSuccess?: (...args: unknown[]) => void;
        onError?: (...args: unknown[]) => void;
    }> = [];
    const useMutationMock = vi.fn((config: {
        onSuccess?: (...args: unknown[]) => void;
        onError?: (...args: unknown[]) => void;
    }) => {
        mutationConfigs.push(config);
        return mutationResult;
    });

    return {
        mutationConfigs,
        mutationResult,
        useQueryMock,
        useMutationMock,
        useUtilsMock: vi.fn(() => ({
            provider: {
                getControlPlane: {
                    invalidate: invalidateControlPlaneMock,
                    setData: vi.fn(),
                },
                getDefaults: {
                    invalidate: vi.fn().mockResolvedValue(undefined),
                    setData: vi.fn(),
                },
            },
            runtime: {
                getShellBootstrap: {
                    invalidate: invalidateShellBootstrapMock,
                    setData: vi.fn(),
                },
            },
        })),
        invalidateControlPlaneMock,
        invalidateShellBootstrapMock,
    };
});

vi.mock('@/web/components/modelSelection/modelCapabilities', () => ({
    buildModelPickerOption: (input: {
        model: { id: string; label: string; providerId: string };
        provider: { id: string; label: string };
    }) => ({
        id: input.model.id,
        label: input.model.label,
        providerId: input.provider.id,
        providerLabel: input.provider.label,
        supportsTools: true,
        supportsVision: false,
        supportsReasoning: false,
        capabilityBadges: [],
        compatibilityState: 'compatible',
    }),
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: controllerTestState.useUtilsMock,
        runtime: {
            getShellBootstrap: {
                useQuery: controllerTestState.useQueryMock,
            },
        },
        provider: {
            setWorkflowRoutingPreference: {
                useMutation: controllerTestState.useMutationMock,
            },
            clearWorkflowRoutingPreference: {
                useMutation: controllerTestState.useMutationMock,
            },
            setModelFavorite: {
                useMutation: controllerTestState.useMutationMock,
            },
        },
    },
}));

import { useProviderWorkflowRoutingController } from '@/web/components/settings/providerSettings/hooks/useProviderWorkflowRoutingController';

let lastControllerState: ReturnType<typeof useProviderWorkflowRoutingController> | undefined;

function ControllerProbe() {
    lastControllerState = useProviderWorkflowRoutingController({ profileId: 'profile_default' });
    return null;
}

describe('useProviderWorkflowRoutingController', () => {
    beforeEach(() => {
        lastControllerState = undefined;
        controllerTestState.useQueryMock.mockClear();
        controllerTestState.useMutationMock.mockClear();
        controllerTestState.useUtilsMock.mockClear();
        controllerTestState.invalidateControlPlaneMock.mockClear();
        controllerTestState.invalidateShellBootstrapMock.mockClear();
        controllerTestState.mutationResult.mutateAsync.mockReset();
        controllerTestState.mutationResult.mutateAsync.mockResolvedValue(undefined);
        controllerTestState.mutationResult.error = null;
        controllerTestState.mutationConfigs.splice(0, controllerTestState.mutationConfigs.length);
    });

    it('derives planning workflow routing targets and supports clearing saved overrides', () => {
        renderToStaticMarkup(<ControllerProbe />);

        expect(lastControllerState?.targets).toHaveLength(2);
        expect(lastControllerState?.targets[0]?.label).toBe('Planning');
        expect(lastControllerState?.targets[0]?.sourceLabel).toBe('Saved workflow routing');
        expect(lastControllerState?.targets[1]?.sourceLabel).toBe('Using planning fallback');
        expect(lastControllerState?.targets[0]?.selectedProviderId).toBe('moonshot');
        expect(lastControllerState?.targets[0]?.selectedModelId).toBe('moonshot/kimi-k2.5');

        lastControllerState?.saveWorkflowRoutingPreference({
            targetKey: 'planning_advanced',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(controllerTestState.mutationResult.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            targetKey: 'planning_advanced',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        lastControllerState?.clearWorkflowRoutingPreference({
            targetKey: 'planning',
        });
        expect(controllerTestState.mutationResult.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            targetKey: 'planning',
        });
    });

    it('invalidates the provider control plane and shell bootstrap caches after a successful save', () => {
        renderToStaticMarkup(<ControllerProbe />);

        controllerTestState.mutationConfigs[0]?.onSuccess?.(
            {
                success: true,
                providerControl: {
                    entries: [],
                    defaults: {
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                    },
                    specialistDefaults: [],
                    workflowRoutingPreferences: [
                        {
                            targetKey: 'planning',
                            providerId: 'openai',
                            modelId: 'openai/gpt-5',
                        },
                    ],
                },
                shellBootstrap: {
                    providerControl: {
                        entries: [],
                        defaults: {
                            providerId: 'openai',
                            modelId: 'openai/gpt-5',
                        },
                        specialistDefaults: [],
                        workflowRoutingPreferences: [
                            {
                                targetKey: 'planning',
                                providerId: 'openai',
                                modelId: 'openai/gpt-5',
                            },
                        ],
                    },
                },
            },
            {
                profileId: 'profile_default',
                targetKey: 'planning',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            }
        );

        expect(controllerTestState.invalidateControlPlaneMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
        expect(controllerTestState.invalidateShellBootstrapMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
    });
});
