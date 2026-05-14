import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ModelPreferenceDraftState {
    utilityModelDraft?:
        | {
              profileId: string;
              providerId?: 'openai';
              modelId?: string;
          }
        | undefined;
    memoryRetrievalModelDraft?:
        | {
              profileId: string;
              providerId?: 'openai';
              modelId?: string;
          }
        | undefined;
}

const reactState = vi.hoisted((): { currentModelPreferenceDrafts: ModelPreferenceDraftState } => ({
    currentModelPreferenceDrafts: {},
}));

vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    return {
        ...actual,
        useState: () => [
            reactState.currentModelPreferenceDrafts,
            (
                value:
                    | typeof reactState.currentModelPreferenceDrafts
                    | ((
                          current: typeof reactState.currentModelPreferenceDrafts
                      ) => typeof reactState.currentModelPreferenceDrafts)
            ) => {
                reactState.currentModelPreferenceDrafts =
                    typeof value === 'function' ? value(reactState.currentModelPreferenceDrafts) : value;
            },
        ],
    };
});

const controllerTestState = vi.hoisted(() => {
    const createCancelMock = () => vi.fn().mockResolvedValue(undefined);
    const createGetDataMock = () => vi.fn();
    const createSetDataMock = () => vi.fn();
    const createMutationResult = () => ({
        mutateAsync: vi.fn().mockResolvedValue(undefined),
        isPending: false,
        error: null,
    });
    type MutationContext = { previous?: unknown; profileId?: string } | undefined;
    type MutationConfig = {
        onMutate?: (...args: unknown[]) => Promise<MutationContext> | MutationContext;
        onError?: (...args: unknown[]) => void;
        onSuccess?: (...args: unknown[]) => void;
    };

    const mutationConfigs: Record<string, MutationConfig> = {};
    const createUseMutationMock = (name: string) => {
        const result = createMutationResult();
        const useMutation = vi.fn((config: MutationConfig) => {
            mutationConfigs[name] = config;
            return result;
        });

        return {
            useMutation,
            result,
        };
    };

    const utilityQueryData = {
        selection: {
            providerId: 'openai',
            modelId: 'openai/gpt-5-mini',
        },
    };
    const utilityConsumerPreferencesQueryData = {
        preferences: [
            {
                consumerId: 'conversation_naming' as const,
                useUtilityModel: true,
            },
            {
                consumerId: 'context_compaction' as const,
                useUtilityModel: true,
            },
        ],
    };
    const memoryRetrievalQueryData = {
        selection: {
            providerId: 'openai',
            modelId: 'openai/text-embedding-3-small',
        },
    };

    return {
        mutationConfigs,
        utilityQueryData,
        utilityConsumerPreferencesQueryData,
        memoryRetrievalQueryData,
        utilsMock: {
            conversation: {
                getEditPreference: {
                    cancel: createCancelMock(),
                    getData: createGetDataMock(),
                    setData: createSetDataMock(),
                },
                getThreadTitlePreference: {
                    cancel: createCancelMock(),
                    getData: createGetDataMock(),
                    setData: createSetDataMock(),
                },
            },
            profile: {
                getExecutionPreset: {
                    cancel: createCancelMock(),
                    getData: createGetDataMock(),
                    setData: createSetDataMock(),
                },
                getUtilityModel: {
                    cancel: createCancelMock(),
                    getData: createGetDataMock(),
                    setData: createSetDataMock(),
                },
                getUtilityModelConsumerPreferences: {
                    cancel: createCancelMock(),
                    getData: createGetDataMock(),
                    setData: createSetDataMock(),
                },
                getMemoryRetrievalModel: {
                    cancel: createCancelMock(),
                    getData: createGetDataMock(),
                    setData: createSetDataMock(),
                },
            },
            runtime: {
                getShellBootstrap: {
                    setData: createSetDataMock(),
                },
            },
        },
        trpcMocks: {
            conversation: {
                getEditPreference: {
                    useQuery: vi.fn(() => ({
                        data: { value: 'ask' },
                    })),
                },
                setEditPreference: createUseMutationMock('setEditPreference'),
                getThreadTitlePreference: {
                    useQuery: vi.fn(() => ({
                        data: { mode: 'template' },
                    })),
                },
                setThreadTitlePreference: createUseMutationMock('setThreadTitlePreference'),
            },
            profile: {
                getExecutionPreset: {
                    useQuery: vi.fn(() => ({
                        data: { preset: 'standard' },
                    })),
                },
                setExecutionPreset: createUseMutationMock('setExecutionPreset'),
                getUtilityModel: {
                    useQuery: vi.fn(() => ({
                        data: utilityQueryData,
                    })),
                },
                setUtilityModel: createUseMutationMock('setUtilityModel'),
                getUtilityModelConsumerPreferences: {
                    useQuery: vi.fn(() => ({
                        data: utilityConsumerPreferencesQueryData,
                    })),
                },
                setUtilityModelConsumerPreference: createUseMutationMock('setUtilityModelConsumerPreference'),
                getMemoryRetrievalModel: {
                    useQuery: vi.fn(() => ({
                        data: memoryRetrievalQueryData,
                    })),
                },
                setMemoryRetrievalModel: createUseMutationMock('setMemoryRetrievalModel'),
                getInternalModelRoleDiagnostics: {
                    useQuery: vi.fn(() => ({
                        data: { diagnostics: [] },
                    })),
                },
            },
            provider: {
                getControlPlane: {
                    useQuery: vi.fn(() => ({
                        data: {
                            providerControl: {
                                providers: [
                                    {
                                        providerId: 'openai',
                                        label: 'OpenAI',
                                        models: [
                                            {
                                                id: 'openai/gpt-5-mini',
                                                label: 'GPT-5 Mini',
                                            },
                                            {
                                                id: 'openai/gpt-5',
                                                label: 'GPT-5',
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    })),
                },
                getEmbeddingControlPlane: {
                    useQuery: vi.fn(() => ({
                        data: {
                            providerEmbeddingControl: {
                                entries: [
                                    {
                                        provider: {
                                            id: 'openai',
                                            label: 'OpenAI',
                                        },
                                        models: [
                                            {
                                                id: 'openai/text-embedding-3-small',
                                                label: 'text-embedding-3-small',
                                                dimensions: 1536,
                                                inputPrice: 0.02,
                                            },
                                            {
                                                id: 'openai/text-embedding-3-large',
                                                label: 'text-embedding-3-large',
                                                dimensions: 3072,
                                                inputPrice: 0.13,
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    })),
                },
            },
        },
    };
});

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => controllerTestState.utilsMock as never,
        conversation: {
            getEditPreference: controllerTestState.trpcMocks.conversation.getEditPreference,
            setEditPreference: controllerTestState.trpcMocks.conversation.setEditPreference,
            getThreadTitlePreference: controllerTestState.trpcMocks.conversation.getThreadTitlePreference,
            setThreadTitlePreference: controllerTestState.trpcMocks.conversation.setThreadTitlePreference,
        },
        profile: {
            getExecutionPreset: controllerTestState.trpcMocks.profile.getExecutionPreset,
            setExecutionPreset: controllerTestState.trpcMocks.profile.setExecutionPreset,
            getUtilityModel: controllerTestState.trpcMocks.profile.getUtilityModel,
            setUtilityModel: controllerTestState.trpcMocks.profile.setUtilityModel,
            getUtilityModelConsumerPreferences:
                controllerTestState.trpcMocks.profile.getUtilityModelConsumerPreferences,
            setUtilityModelConsumerPreference: controllerTestState.trpcMocks.profile.setUtilityModelConsumerPreference,
            getMemoryRetrievalModel: controllerTestState.trpcMocks.profile.getMemoryRetrievalModel,
            setMemoryRetrievalModel: controllerTestState.trpcMocks.profile.setMemoryRetrievalModel,
            getInternalModelRoleDiagnostics: controllerTestState.trpcMocks.profile.getInternalModelRoleDiagnostics,
        },
        provider: {
            getControlPlane: controllerTestState.trpcMocks.provider.getControlPlane,
            getEmbeddingControlPlane: controllerTestState.trpcMocks.provider.getEmbeddingControlPlane,
        },
    },
}));

type ProviderControlProviderForTest = {
    providerId: string;
    label: string;
};

type ProviderControlForTest = {
    providers: ProviderControlProviderForTest[];
};

vi.mock('@/web/lib/providerControl/selectors', () => ({
    listProviderControlProviders: (providerControl: ProviderControlForTest) =>
        providerControl.providers.map((provider) => ({
            id: provider.providerId,
            label: provider.label,
        })),
    findProviderControlEntry: (providerControl: ProviderControlForTest, providerId: string | undefined) =>
        providerControl.providers.find((provider) => provider.providerId === providerId),
}));

vi.mock('@/web/components/modelSelection/modelCapabilities', () => ({
    buildModelPickerOption: ({
        model,
        provider,
    }: {
        model: { id: string; label: string };
        provider?: { id: string };
    }) => ({
        id: model.id,
        label: model.label,
        providerId: provider?.id,
    }),
}));

import { useProfilePreferencesController } from '@/web/components/settings/profileSettings/useProfilePreferencesController';

let lastController: ReturnType<typeof useProfilePreferencesController> | undefined;

function Harness() {
    lastController = useProfilePreferencesController({
        selection: {
            selectedProfile: {
                id: 'profile_default',
                name: 'Default',
                isActive: true,
                createdAt: '2026-03-31T00:00:00.000Z',
                updatedAt: '2026-03-31T00:00:00.000Z',
            },
            selectedProfileIdForSettings: 'profile_default',
        } as never,
        setStatusMessage: vi.fn(),
    });
    return null;
}

function getMutationConfig(name: keyof typeof controllerTestState.mutationConfigs) {
    const config = controllerTestState.mutationConfigs[name];
    if (!config) {
        throw new Error(`Expected mutation config "${name}" to be registered.`);
    }

    return config;
}

describe('useProfilePreferencesController', () => {
    beforeEach(() => {
        lastController = undefined;
        reactState.currentModelPreferenceDrafts = {};
        vi.clearAllMocks();
        for (const key of Object.keys(controllerTestState.mutationConfigs)) {
            Reflect.deleteProperty(controllerTestState.mutationConfigs, key);
        }
        controllerTestState.utilityQueryData.selection = {
            providerId: 'openai',
            modelId: 'openai/gpt-5-mini',
        };
        controllerTestState.utilityConsumerPreferencesQueryData.preferences = [
            {
                consumerId: 'conversation_naming',
                useUtilityModel: true,
            },
            {
                consumerId: 'context_compaction',
                useUtilityModel: true,
            },
        ];
        controllerTestState.memoryRetrievalQueryData.selection = {
            providerId: 'openai',
            modelId: 'openai/text-embedding-3-small',
        };
    });

    it('optimistically updates and rolls back Utility AI selection mutations', async () => {
        renderToStaticMarkup(<Harness />);

        controllerTestState.utilsMock.profile.getUtilityModel.getData.mockReturnValue({
            selection: {
                providerId: 'openai',
                modelId: 'openai/gpt-5-mini',
            },
        });

        const context = await getMutationConfig('setUtilityModel').onMutate?.({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        expect(controllerTestState.utilsMock.profile.getUtilityModel.setData).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            {
                selection: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
            }
        );

        getMutationConfig('setUtilityModel').onError?.(
            new Error('fail'),
            {
                profileId: 'profile_default',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            context
        );

        expect(controllerTestState.utilsMock.profile.getUtilityModel.setData).toHaveBeenLastCalledWith(
            { profileId: 'profile_default' },
            {
                selection: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5-mini',
                },
            }
        );
    });

    it('clears local draft state after successful Utility AI save and writes null on clear', async () => {
        renderToStaticMarkup(<Harness />);
        lastController?.setUtilityModelId('openai/gpt-5');
        renderToStaticMarkup(<Harness />);

        await lastController?.saveUtilityModel();

        expect(controllerTestState.trpcMocks.profile.setUtilityModel.result.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(reactState.currentModelPreferenceDrafts.utilityModelDraft).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        getMutationConfig('setUtilityModel').onSuccess?.(
            {
                selection: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
            },
            {
                profileId: 'profile_default',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            }
        );

        expect(reactState.currentModelPreferenceDrafts.utilityModelDraft).toBeUndefined();
        renderToStaticMarkup(<Harness />);
        expect(lastController?.selectedUtilityModelId).toBe('openai/gpt-5-mini');

        await lastController?.clearUtilityModel();

        expect(controllerTestState.trpcMocks.profile.setUtilityModel.result.mutateAsync).toHaveBeenLastCalledWith({
            profileId: 'profile_default',
        });
        await getMutationConfig('setUtilityModel').onMutate?.({
            profileId: 'profile_default',
        });
        expect(controllerTestState.utilsMock.profile.getUtilityModel.setData).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            {
                selection: null,
            }
        );
    });

    it('optimistically updates and rolls back Utility AI consumer preferences', async () => {
        renderToStaticMarkup(<Harness />);

        controllerTestState.utilsMock.profile.getUtilityModelConsumerPreferences.getData.mockReturnValue({
            preferences: [
                {
                    consumerId: 'conversation_naming',
                    useUtilityModel: true,
                },
                {
                    consumerId: 'context_compaction',
                    useUtilityModel: true,
                },
            ],
        });

        const context = await getMutationConfig('setUtilityModelConsumerPreference').onMutate?.({
            profileId: 'profile_default',
            consumerId: 'context_compaction',
            useUtilityModel: false,
        });

        expect(controllerTestState.utilsMock.profile.getUtilityModelConsumerPreferences.setData).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            {
                preferences: [
                    {
                        consumerId: 'conversation_naming',
                        useUtilityModel: true,
                    },
                    {
                        consumerId: 'context_compaction',
                        useUtilityModel: false,
                    },
                ],
            }
        );

        getMutationConfig('setUtilityModelConsumerPreference').onError?.(
            new Error('fail'),
            {
                profileId: 'profile_default',
                consumerId: 'context_compaction',
                useUtilityModel: false,
            },
            context
        );

        expect(
            controllerTestState.utilsMock.profile.getUtilityModelConsumerPreferences.setData
        ).toHaveBeenLastCalledWith(
            { profileId: 'profile_default' },
            {
                preferences: [
                    {
                        consumerId: 'conversation_naming',
                        useUtilityModel: true,
                    },
                    {
                        consumerId: 'context_compaction',
                        useUtilityModel: true,
                    },
                ],
            }
        );
    });

    it('optimistically updates and rolls back Memory Retrieval selection mutations', async () => {
        renderToStaticMarkup(<Harness />);

        controllerTestState.utilsMock.profile.getMemoryRetrievalModel.getData.mockReturnValue({
            selection: {
                providerId: 'openai',
                modelId: 'openai/text-embedding-3-small',
            },
        });

        const context = await getMutationConfig('setMemoryRetrievalModel').onMutate?.({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/text-embedding-3-large',
        });

        expect(controllerTestState.utilsMock.profile.getMemoryRetrievalModel.setData).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            {
                selection: {
                    providerId: 'openai',
                    modelId: 'openai/text-embedding-3-large',
                },
            }
        );

        getMutationConfig('setMemoryRetrievalModel').onError?.(
            new Error('fail'),
            {
                profileId: 'profile_default',
                providerId: 'openai',
                modelId: 'openai/text-embedding-3-large',
            },
            context
        );

        expect(controllerTestState.utilsMock.profile.getMemoryRetrievalModel.setData).toHaveBeenLastCalledWith(
            { profileId: 'profile_default' },
            {
                selection: {
                    providerId: 'openai',
                    modelId: 'openai/text-embedding-3-small',
                },
            }
        );
    });

    it('builds Memory Retrieval options from the embedding control plane', () => {
        renderToStaticMarkup(<Harness />);

        expect(lastController?.memoryRetrievalModelOptions.map((option) => option.id)).toEqual([
            'openai/text-embedding-3-small',
            'openai/text-embedding-3-large',
        ]);
        expect(lastController?.selectedMemoryRetrievalModelId).toBe('openai/text-embedding-3-small');
        expect(lastController?.memoryRetrievalModelOptions[0]?.price).toBe(0.02);
    });

    it('clears local Memory Retrieval draft state after successful save and writes null on clear', async () => {
        renderToStaticMarkup(<Harness />);
        lastController?.setMemoryRetrievalModelId('openai/text-embedding-3-large');
        renderToStaticMarkup(<Harness />);

        await lastController?.saveMemoryRetrievalModel();

        expect(controllerTestState.trpcMocks.profile.setMemoryRetrievalModel.result.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/text-embedding-3-large',
        });
        expect(reactState.currentModelPreferenceDrafts.memoryRetrievalModelDraft).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/text-embedding-3-large',
        });

        getMutationConfig('setMemoryRetrievalModel').onSuccess?.(
            {
                selection: {
                    providerId: 'openai',
                    modelId: 'openai/text-embedding-3-large',
                },
            },
            {
                profileId: 'profile_default',
                providerId: 'openai',
                modelId: 'openai/text-embedding-3-large',
            }
        );

        expect(reactState.currentModelPreferenceDrafts.memoryRetrievalModelDraft).toBeUndefined();
        renderToStaticMarkup(<Harness />);
        expect(lastController?.selectedMemoryRetrievalModelId).toBe('openai/text-embedding-3-small');

        await lastController?.clearMemoryRetrievalModel();

        expect(
            controllerTestState.trpcMocks.profile.setMemoryRetrievalModel.result.mutateAsync
        ).toHaveBeenLastCalledWith({
            profileId: 'profile_default',
        });
        await getMutationConfig('setMemoryRetrievalModel').onMutate?.({
            profileId: 'profile_default',
        });
        expect(controllerTestState.utilsMock.profile.getMemoryRetrievalModel.setData).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            {
                selection: null,
            }
        );
    });
});
