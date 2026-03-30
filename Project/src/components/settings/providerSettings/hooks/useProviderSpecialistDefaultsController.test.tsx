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
                                id: 'openai/gpt-4o',
                                label: 'GPT-4o',
                                providerId: 'openai',
                            },
                            {
                                id: 'openai/gpt-4o-mini',
                                label: 'GPT-4o mini',
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
                            id: 'kilo',
                            label: 'Kilo',
                            authState: 'authenticated',
                            authMethod: 'device_code',
                        },
                        models: [
                            {
                                id: 'kilo/frontier',
                                label: 'Frontier',
                                providerId: 'kilo',
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
                    modelId: 'openai/gpt-4o',
                },
                specialistDefaults: [
                    {
                        topLevelTab: 'agent',
                        modeKey: 'ask',
                        providerId: 'kilo',
                        modelId: 'kilo/frontier',
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
    const mutationConfigs: {
        onSuccess: ((...args: unknown[]) => void) | undefined;
        onError: ((...args: unknown[]) => void) | undefined;
    } = {
        onSuccess: undefined,
        onError: undefined,
    };
    const useMutationMock = vi.fn((config: {
        onSuccess?: (...args: unknown[]) => void;
        onError?: (...args: unknown[]) => void;
    }) => {
        mutationConfigs.onSuccess = config.onSuccess;
        mutationConfigs.onError = config.onError;
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
                },
            },
            runtime: {
                getShellBootstrap: {
                    invalidate: invalidateShellBootstrapMock,
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
            setSpecialistDefault: {
                useMutation: controllerTestState.useMutationMock,
            },
        },
    },
}));

import { useProviderSpecialistDefaultsController } from '@/web/components/settings/providerSettings/hooks/useProviderSpecialistDefaultsController';

let lastControllerState: ReturnType<typeof useProviderSpecialistDefaultsController> | undefined;

function ControllerProbe() {
    lastControllerState = useProviderSpecialistDefaultsController({ profileId: 'profile_default' });
    return null;
}

describe('useProviderSpecialistDefaultsController', () => {
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
        controllerTestState.mutationConfigs.onSuccess = undefined;
        controllerTestState.mutationConfigs.onError = undefined;
    });

    it('derives grouped defaults and treats save failures as fail-closed controller behavior', async () => {
        renderToStaticMarkup(<ControllerProbe />);

        expect(lastControllerState?.feedback).toEqual({
            message: undefined,
            tone: 'info',
        });
        expect(lastControllerState?.groups).toHaveLength(2);
        expect(lastControllerState?.groups[0]?.targets[0]?.selectedProviderId).toBe('kilo');
        expect(lastControllerState?.groups[0]?.targets[0]?.selectedModelId).toBe('kilo/frontier');
        expect(lastControllerState?.groups[0]?.targets[1]?.selectedProviderId).toBe('openai');
        expect(lastControllerState?.groups[0]?.targets[1]?.selectedModelId).toBe('openai/gpt-4o');

        controllerTestState.mutationResult.mutateAsync.mockRejectedValueOnce(new Error('save failed'));
        lastControllerState?.saveSpecialistDefault({
            topLevelTab: 'agent',
            modeKey: 'ask',
            providerId: 'openai',
            modelId: 'openai/gpt-4o',
        });
        expect(controllerTestState.mutationResult.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            topLevelTab: 'agent',
            modeKey: 'ask',
            providerId: 'openai',
            modelId: 'openai/gpt-4o',
        });
    });

    it('invalidates provider control and shell bootstrap state after a successful save', () => {
        renderToStaticMarkup(<ControllerProbe />);

        controllerTestState.mutationConfigs.onSuccess?.(
            {
                success: true,
            },
            {
                profileId: 'profile_default',
                topLevelTab: 'agent',
                modeKey: 'ask',
                providerId: 'kilo',
                modelId: 'kilo/frontier',
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
