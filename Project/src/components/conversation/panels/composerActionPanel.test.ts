import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => ({
            session: {
                getAttachedSkills: { invalidate: vi.fn() },
                getAttachedRules: { invalidate: vi.fn() },
            },
            registry: {
                searchSkills: { invalidate: vi.fn() },
                searchRules: { invalidate: vi.fn() },
            },
        }),
        registry: {
            searchSkills: {
                useQuery: () => ({
                    data: {
                        skillfiles: [],
                    },
                }),
            },
            searchRules: {
                useQuery: () => ({
                    data: {
                        rulesets: [],
                    },
                }),
            },
        },
        session: {
            previewRunContract: {
                useQuery: () => ({
                    data: undefined,
                    isFetching: false,
                }),
            },
            setAttachedSkills: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            setAttachedRules: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
        },
    },
}));

import {
    ComposerActionPanel,
    handleComposerSlashAcceptance,
    shouldSubmitComposerOnEnter,
} from '@/web/components/conversation/panels/composerActionPanel';
import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';

import type { ResolvedContextState } from '@/shared/contracts';

function createEmptyPreparedContextSummary() {
    return {
        contributors: [],
        digest: {
            fullDigest: 'runctx-empty',
            contributorDigest: 'ctxcontributors-empty',
            cacheabilityHint:
                'Prepared context is stable until prompt layers, mode overrides, or system-owned contributors change.',
            checkpoints: {
                bootstrap: {
                    checkpoint: 'bootstrap',
                    includedContributorCount: 0,
                    excludedContributorCount: 0,
                    digest: 'ctxchk-bootstrap-empty',
                    active: true,
                },
                post_compaction_reseed: {
                    checkpoint: 'post_compaction_reseed',
                    includedContributorCount: 0,
                    excludedContributorCount: 0,
                    digest: 'ctxchk-post_compaction_reseed-empty',
                    active: false,
                },
            },
        },
        activeContributorCount: 0,
        compactionReseedActive: false,
    } satisfies ResolvedContextState['preparedContext'];
}

function createModelOption(
    input: Partial<ModelPickerOption> & Pick<ModelPickerOption, 'id' | 'label'>
): ModelPickerOption {
    return {
        id: input.id,
        label: input.label,
        supportsTools: input.supportsTools ?? true,
        supportsVision: input.supportsVision ?? false,
        supportsReasoning: input.supportsReasoning ?? false,
        capabilityBadges: input.capabilityBadges ?? [],
        compatibilityState: input.compatibilityState ?? 'compatible',
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.providerLabel ? { providerLabel: input.providerLabel } : {}),
        ...(input.reasoningEfforts ? { reasoningEfforts: input.reasoningEfforts } : {}),
    };
}

function createContextState(
    input?: Partial<ResolvedContextState['policy']> & {
        totalTokens?: number;
        estimateMode?: 'exact' | 'estimated';
        includeBudget?: boolean;
        includeThreshold?: boolean;
        includeEstimate?: boolean;
    }
): ResolvedContextState {
    const {
        totalTokens,
        estimateMode,
        includeBudget = true,
        includeThreshold = true,
        includeEstimate = totalTokens !== undefined,
        ...policyOverrides
    } = input ?? {};

    return {
        policy: {
            enabled: true,
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            limits: {
                profileId: 'profile_default',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                contextLength: 128000,
                maxOutputTokens: 8192,
                contextLengthSource: 'static',
                maxOutputTokensSource: 'static',
                source: 'static',
                modelLimitsKnown: true,
            },
            mode: 'percent',
            ...(includeBudget ? { usableInputBudgetTokens: 100000 } : {}),
            ...(includeThreshold ? { thresholdTokens: 80000 } : {}),
            percent: 80,
            ...policyOverrides,
        },
        countingMode: estimateMode ?? 'exact',
        ...(!includeEstimate || totalTokens === undefined
            ? {}
            : {
                  estimate: {
                      providerId: 'openai',
                      modelId: 'openai/gpt-5',
                      mode: estimateMode ?? 'exact',
                      totalTokens,
                      parts: [],
                  },
              }),
        compactable: true,
        preparedContext: createEmptyPreparedContextSummary(),
    };
}

function createComposerActionPanelProps(
    input: Omit<Partial<ComponentProps<typeof ComposerActionPanel>>, 'profileId'>
): ComponentProps<typeof ComposerActionPanel> {
    const {
        pendingTextFiles,
        pendingDocuments,
        readyComposerAttachments,
        hasBlockingPendingAttachments,
        onAddFiles,
        onRemovePendingTextFile,
        onRemovePendingDocument,
        ...rest
    } = input;
    return Object.assign({}, rest, {
        profileId: 'profile_default',
        pendingTextFiles: pendingTextFiles ?? [],
        pendingDocuments: pendingDocuments ?? [],
        readyComposerAttachments: readyComposerAttachments ?? [],
        hasBlockingPendingAttachments: hasBlockingPendingAttachments ?? false,
        onAddFiles: onAddFiles ?? (() => {}),
        onRemovePendingTextFile: onRemovePendingTextFile ?? (() => {}),
        onRemovePendingDocument: onRemovePendingDocument ?? (() => {}),
    }) as ComponentProps<typeof ComposerActionPanel>;
}

describe('composer enter handling', () => {
    it('submits only on plain enter', () => {
        expect(
            shouldSubmitComposerOnEnter({
                key: 'Enter',
                shiftKey: false,
                nativeEvent: {},
            })
        ).toBe(true);
        expect(
            shouldSubmitComposerOnEnter({
                key: 'Enter',
                shiftKey: true,
                nativeEvent: {},
            })
        ).toBe(false);
        expect(
            shouldSubmitComposerOnEnter({
                key: 'a',
                shiftKey: false,
                nativeEvent: {},
            })
        ).toBe(false);
    });

    it('suppresses submit while IME composition is active', () => {
        expect(
            shouldSubmitComposerOnEnter({
                key: 'Enter',
                shiftKey: false,
                nativeEvent: { isComposing: true },
            })
        ).toBe(false);
    });

    it('opens inspector slash commands without submitting a prompt', async () => {
        const onSubmitPrompt = vi.fn();
        const onSetDraftPrompt = vi.fn();
        const onFocusPrompt = vi.fn();
        const onError = vi.fn();
        const onOpenInspectorSection = vi.fn();

        await handleComposerSlashAcceptance({
            acceptHighlighted: () =>
                Promise.resolve({
                    handled: true,
                    clearDraft: true,
                    inspectorSectionId: 'pending-permissions',
                }),
            draftPrompt: '/permissions',
            submitWhenUnhandled: true,
            onSubmitPrompt,
            onSetDraftPrompt,
            onFocusPrompt,
            onError,
            onOpenInspectorSection,
        });

        expect(onSubmitPrompt).not.toHaveBeenCalled();
        expect(onOpenInspectorSection).toHaveBeenCalledWith('pending-permissions');
        expect(onSetDraftPrompt).toHaveBeenCalledWith('');
        expect(onFocusPrompt).toHaveBeenCalledTimes(1);
    });

    it('disables reasoning selection when the active model does not support it', () => {
        const html = renderToStaticMarkup(
            createElement(
                ComposerActionPanel,
                createComposerActionPanelProps({
                    pendingImages: [],
                    disabled: false,
                    isSubmitting: false,
                    selectedProviderId: 'openai',
                    selectedModelId: 'openai/gpt-5',
                    topLevelTab: 'chat',
                    activeModeKey: 'chat',
                    modes: [],
                    reasoningEffort: 'none',
                    selectedModelSupportsReasoning: false,
                    canAttachImages: false,
                    maxImageAttachmentsPerMessage: 4,
                    modelOptions: [
                        createModelOption({
                            id: 'openai/gpt-5',
                            label: 'GPT-5',
                            providerId: 'openai',
                            providerLabel: 'OpenAI',
                        }),
                    ],
                    runErrorMessage: undefined,
                    onProviderChange: () => {},
                    onModelChange: () => {},
                    onReasoningEffortChange: () => {},
                    onModeChange: () => {},
                    onPromptEdited: () => {},
                    onAddFiles: () => {},
                    onRemovePendingImage: () => {},
                    onRetryPendingImage: () => {},
                    onSubmitPrompt: () => {},
                })
            )
        );

        expect(html).toContain('Reasoning');
        expect(html).toContain('This model does not support reasoning.');
        expect(html).toContain('composer-reasoning-select');
        expect(html).toContain('disabled=""');
    });

    it('disables adjustable reasoning when Kilo does not advertise valid effort levels', () => {
        const html = renderToStaticMarkup(
            createElement(
                ComposerActionPanel,
                createComposerActionPanelProps({
                    pendingImages: [],
                    disabled: false,
                    isSubmitting: false,
                    selectedProviderId: 'kilo',
                    selectedModelId: 'google/gemini-2.5-flash-lite',
                    topLevelTab: 'chat',
                    activeModeKey: 'chat',
                    modes: [],
                    reasoningEffort: 'none',
                    selectedModelSupportsReasoning: true,
                    supportedReasoningEfforts: [],
                    canAttachImages: false,
                    maxImageAttachmentsPerMessage: 4,
                    modelOptions: [
                        createModelOption({
                            id: 'google/gemini-2.5-flash-lite',
                            label: 'Gemini 2.5 Flash Lite',
                            providerId: 'kilo',
                            providerLabel: 'Kilo',
                        }),
                    ],
                    runErrorMessage: undefined,
                    onProviderChange: () => {},
                    onModelChange: () => {},
                    onReasoningEffortChange: () => {},
                    onModeChange: () => {},
                    onPromptEdited: () => {},
                    onAddFiles: () => {},
                    onRemovePendingImage: () => {},
                    onRetryPendingImage: () => {},
                    onSubmitPrompt: () => {},
                })
            )
        );

        expect(html).toContain(
            'This model supports reasoning, but Kilo does not expose trusted adjustable effort levels.'
        );
        expect(html).toContain('disabled=""');
    });

    it('disables adjustable reasoning when Kilo omits trusted effort metadata entirely', () => {
        const html = renderToStaticMarkup(
            createElement(
                ComposerActionPanel,
                createComposerActionPanelProps({
                    pendingImages: [],
                    disabled: false,
                    isSubmitting: false,
                    selectedProviderId: 'kilo',
                    selectedModelId: 'openai/gpt-5',
                    topLevelTab: 'chat',
                    activeModeKey: 'chat',
                    modes: [],
                    reasoningEffort: 'high',
                    selectedModelSupportsReasoning: true,
                    canAttachImages: false,
                    maxImageAttachmentsPerMessage: 4,
                    modelOptions: [
                        createModelOption({
                            id: 'openai/gpt-5',
                            label: 'GPT-5',
                            providerId: 'kilo',
                            providerLabel: 'Kilo',
                        }),
                    ],
                    runErrorMessage: undefined,
                    onProviderChange: () => {},
                    onModelChange: () => {},
                    onReasoningEffortChange: () => {},
                    onModeChange: () => {},
                    onPromptEdited: () => {},
                    onAddFiles: () => {},
                    onRemovePendingImage: () => {},
                    onRetryPendingImage: () => {},
                    onSubmitPrompt: () => {},
                })
            )
        );

        expect(html).toContain(
            'This model supports reasoning, but Kilo does not expose trusted adjustable effort levels.'
        );
        expect(html).toContain('disabled=""');
    });

    it('shows the selected model incompatibility reason inline', () => {
        const html = renderToStaticMarkup(
            createElement(
                ComposerActionPanel,
                createComposerActionPanelProps({
                    pendingImages: [],
                    disabled: false,
                    isSubmitting: false,
                    selectedProviderId: 'openai',
                    selectedModelId: 'openai/gpt-5-text',
                    topLevelTab: 'agent',
                    activeModeKey: 'code',
                    modes: [],
                    reasoningEffort: 'none',
                    selectedModelSupportsReasoning: true,
                    canAttachImages: false,
                    maxImageAttachmentsPerMessage: 4,
                    selectedModelCompatibilityState: 'incompatible',
                    selectedModelCompatibilityReason: 'This mode requires native tool calling.',
                    modelOptions: [
                        createModelOption({
                            id: 'openai/gpt-5-text',
                            label: 'GPT-5 Text',
                            providerId: 'openai',
                            providerLabel: 'OpenAI',
                            compatibilityState: 'incompatible',
                            compatibilityReason: 'This mode requires native tool calling.',
                        }),
                    ],
                    runErrorMessage: undefined,
                    onProviderChange: () => {},
                    onModelChange: () => {},
                    onReasoningEffortChange: () => {},
                    onModeChange: () => {},
                    onPromptEdited: () => {},
                    onAddFiles: () => {},
                    onRemovePendingImage: () => {},
                    onRetryPendingImage: () => {},
                    onSubmitPrompt: () => {},
                })
            )
        );

        expect(html).toContain('This mode requires native tool calling.');
    });

    it('renders the composer control surface over existing run context inputs', () => {
        const html = renderToStaticMarkup(
            createElement(
                ComposerActionPanel,
                createComposerActionPanelProps({
                    pendingImages: [
                        {
                            clientId: 'img_ready',
                            fileName: 'ready.png',
                            previewUrl: 'blob:ready',
                            status: 'ready',
                        },
                    ],
                    readyComposerAttachments: [
                        {
                            clientId: 'img_ready',
                            mimeType: 'image/png',
                            bytesBase64: 'abc',
                            width: 1,
                            height: 1,
                            sha256: 'sha',
                        },
                    ],
                    hasBlockingPendingAttachments: false,
                    disabled: false,
                    isSubmitting: false,
                    selectedProviderId: 'openai',
                    selectedModelId: 'openai/gpt-5',
                    topLevelTab: 'agent',
                    activeModeKey: 'code',
                    modes: [{ id: 'agent.code', modeKey: 'code', label: 'Code' } as never],
                    reasoningEffort: 'high',
                    selectedModelSupportsReasoning: true,
                    canAttachImages: true,
                    maxImageAttachmentsPerMessage: 4,
                    modelOptions: [
                        createModelOption({
                            id: 'openai/gpt-5',
                            label: 'GPT-5',
                            providerId: 'openai',
                            providerLabel: 'OpenAI',
                        }),
                    ],
                    runErrorMessage: undefined,
                    attachedRules: [
                        {
                            name: 'Review Rules',
                            assetKey: 'rules/review',
                        } as never,
                    ],
                    attachedSkills: [
                        {
                            name: 'Debug Skill',
                            assetKey: 'skills/debug',
                            dynamicContextSources: [],
                        } as never,
                    ],
                    browserContextSummary: {
                        targetUrl: 'http://localhost:5173',
                        targetLabel: 'Local app',
                        selectedElementCount: 1,
                        commentCount: 2,
                        captureCount: 1,
                        enrichmentMode: 'dom_only',
                        designerDraftCount: 1,
                        designerPatchCount: 0,
                        designerApplyIntentStatus: 'none',
                        designDiagnosticCount: 0,
                        designDiagnosticWarningCount: 0,
                        designDiagnosticErrorCount: 0,
                        digest: 'browserctx-test',
                    },
                    selectedSessionId: 'sess_default',
                    pendingPermissionCount: 2,
                    planControlSummary: {
                        status: 'awaiting_answers',
                        requiredQuestionCount: 2,
                        unansweredRequiredQuestionCount: 1,
                        optionalQuestionCount: 0,
                    },
                    inspectorSectionIds: ['context-assets', 'pending-permissions', 'plan-and-orchestration'],
                    showRunContractPreview: false,
                    onProviderChange: () => {},
                    onModelChange: () => {},
                    onReasoningEffortChange: () => {},
                    onModeChange: () => {},
                    onPromptEdited: () => {},
                    onAddFiles: () => {},
                    onRemovePendingImage: () => {},
                    onRetryPendingImage: () => {},
                    onSubmitPrompt: () => {},
                    onQueuePrompt: () => {},
                    onOpenBrowserSurface: () => {},
                    onOpenInspectorSection: () => {},
                })
            )
        );

        expect(html).toContain('Composer control surface');
        expect(html).toContain('1 ready / 1 file');
        expect(html).toContain('1 rules / 1 skills');
        expect(html).toContain('2 comments / 1 elements');
        expect(html).toContain('Terminal');
        expect(html).toContain('No selection');
        expect(html).toContain('GPT-5');
        expect(html).toContain('2 approvals');
        expect(html).toContain('1 required open');
        expect(html).toContain('Start or queue');
    });

    it.each(['chat', 'agent', 'orchestrator'] satisfies Array<'chat' | 'agent' | 'orchestrator'>)(
        'shows live context usage details for %s',
        (topLevelTab) => {
            const html = renderToStaticMarkup(
                createElement(
                    ComposerActionPanel,
                    createComposerActionPanelProps({
                        pendingImages: [],
                        disabled: false,
                        isSubmitting: false,
                        selectedProviderId: 'openai',
                        selectedModelId: 'openai/gpt-5',
                        topLevelTab,
                        activeModeKey: topLevelTab,
                        modes: [],
                        reasoningEffort: 'none',
                        selectedModelSupportsReasoning: false,
                        canAttachImages: false,
                        maxImageAttachmentsPerMessage: 4,
                        modelOptions: [
                            createModelOption({
                                id: 'openai/gpt-5',
                                label: 'GPT-5',
                                providerId: 'openai',
                                providerLabel: 'OpenAI',
                            }),
                        ],
                        runErrorMessage: undefined,
                        contextState: createContextState({
                            totalTokens: 40000,
                            usableInputBudgetTokens: 100000,
                            thresholdTokens: 80000,
                            estimateMode: 'exact',
                        }),
                        onProviderChange: () => {},
                        onModelChange: () => {},
                        onReasoningEffortChange: () => {},
                        onModeChange: () => {},
                        onPromptEdited: () => {},
                        onAddFiles: () => {},
                        onRemovePendingImage: () => {},
                        onRetryPendingImage: () => {},
                        onSubmitPrompt: () => {},
                    })
                )
            );

            expect(html).toContain('40,000 used of 100,000 usable input tokens');
            expect(html).toContain('Remaining 60,000');
            expect(html).toContain('Usage 40%');
            expect(html).toContain('Exact counting');
            expect(html).toContain('Compaction threshold: 80,000 tokens.');
            expect(html).toContain('Prepared context: 0 loaded contributors.');
        }
    );

    it('shows dynamic skill load and blocked counts in the context summary', () => {
        const html = renderToStaticMarkup(
            createElement(
                ComposerActionPanel,
                createComposerActionPanelProps({
                    pendingImages: [],
                    disabled: false,
                    isSubmitting: false,
                    selectedProviderId: 'openai',
                    selectedModelId: 'openai/gpt-5',
                    topLevelTab: 'agent',
                    activeModeKey: 'code',
                    modes: [],
                    reasoningEffort: 'none',
                    selectedModelSupportsReasoning: false,
                    canAttachImages: false,
                    maxImageAttachmentsPerMessage: 4,
                    modelOptions: [
                        createModelOption({
                            id: 'openai/gpt-5',
                            label: 'GPT-5',
                            providerId: 'openai',
                            providerLabel: 'OpenAI',
                        }),
                    ],
                    runErrorMessage: undefined,
                    contextState: {
                        ...createContextState({
                            totalTokens: 40000,
                            usableInputBudgetTokens: 100000,
                            thresholdTokens: 80000,
                            estimateMode: 'exact',
                        }),
                        preparedContext: {
                            ...createEmptyPreparedContextSummary(),
                            contributors: [
                                {
                                    id: 'dynamic:resolved',
                                    kind: 'dynamic_skill_context',
                                    group: 'dynamic_skill_context',
                                    label: 'Dynamic resolved',
                                    source: {
                                        kind: 'skill_dynamic_context',
                                        key: 'skills/review:resolved',
                                        label: 'Dynamic resolved',
                                    },
                                    inclusionState: 'included',
                                    inclusionReason: 'Included.',
                                    injectionCheckpoint: 'bootstrap',
                                    resolvedOrder: 0,
                                    countMode: 'estimated',
                                    trustLevel: 'workspace_content',
                                    instructionAuthority: 'contextualize',
                                    digest: 'ctxcontrib-resolved',
                                    dynamicExpansion: {
                                        sourceId: 'resolved',
                                        sourceLabel: 'Resolved',
                                        required: true,
                                        effectiveSafetyClass: 'safe',
                                        resolutionState: 'resolved',
                                        commandDigest: 'dynctxcmd-resolved',
                                        outputDigest: 'dynctxout-resolved',
                                        truncated: false,
                                    },
                                },
                                {
                                    id: 'dynamic:blocked',
                                    kind: 'dynamic_skill_context',
                                    group: 'dynamic_skill_context',
                                    label: 'Dynamic blocked',
                                    source: {
                                        kind: 'skill_dynamic_context',
                                        key: 'skills/review:blocked',
                                        label: 'Dynamic blocked',
                                    },
                                    inclusionState: 'excluded',
                                    inclusionReason: 'Blocked pending approval.',
                                    injectionCheckpoint: 'bootstrap',
                                    resolvedOrder: 1,
                                    countMode: 'estimated',
                                    trustLevel: 'workspace_content',
                                    instructionAuthority: 'contextualize',
                                    digest: 'ctxcontrib-blocked',
                                    dynamicExpansion: {
                                        sourceId: 'blocked',
                                        sourceLabel: 'Blocked',
                                        required: false,
                                        effectiveSafetyClass: 'unsafe',
                                        resolutionState: 'pending_approval',
                                        commandDigest: 'dynctxcmd-blocked',
                                        truncated: false,
                                        permissionRequestId: 'perm_blocked',
                                    },
                                },
                            ],
                            activeContributorCount: 1,
                        },
                    },
                    onProviderChange: () => {},
                    onModelChange: () => {},
                    onReasoningEffortChange: () => {},
                    onModeChange: () => {},
                    onPromptEdited: () => {},
                    onAddFiles: () => {},
                    onRemovePendingImage: () => {},
                    onRetryPendingImage: () => {},
                    onSubmitPrompt: () => {},
                })
            )
        );

        expect(html).toContain('Prepared context: 1 loaded contributor.');
        expect(html).toContain('Dynamic skills: 1 loaded · 1 blocked or unresolved.');
        expect(html).toContain('Dynamic skill context is blocked or unresolved');
        expect(html).toContain('1 dynamic skill contributor did not resolve into prepared context.');
    });

    it('keeps context disabled-state messaging focused on thread usage', () => {
        const html = renderToStaticMarkup(
            createElement(
                ComposerActionPanel,
                createComposerActionPanelProps({
                    pendingImages: [],
                    disabled: false,
                    isSubmitting: false,
                    selectedProviderId: 'openai',
                    selectedModelId: 'openai/gpt-5',
                    topLevelTab: 'chat',
                    activeModeKey: 'chat',
                    modes: [],
                    reasoningEffort: 'none',
                    selectedModelSupportsReasoning: false,
                    canAttachImages: false,
                    maxImageAttachmentsPerMessage: 4,
                    modelOptions: [
                        createModelOption({
                            id: 'openai/gpt-5',
                            label: 'GPT-5',
                            providerId: 'openai',
                            providerLabel: 'OpenAI',
                        }),
                    ],
                    runErrorMessage: undefined,
                    contextState: createContextState({
                        disabledReason: 'multimodal_counting_unavailable',
                        includeBudget: false,
                        includeThreshold: false,
                        includeEstimate: false,
                    }),
                    onProviderChange: () => {},
                    onModelChange: () => {},
                    onReasoningEffortChange: () => {},
                    onModeChange: () => {},
                    onPromptEdited: () => {},
                    onAddFiles: () => {},
                    onRemovePendingImage: () => {},
                    onRetryPendingImage: () => {},
                    onSubmitPrompt: () => {},
                })
            )
        );

        expect(html).toContain(
            'Current thread usage is unavailable for image sessions because multimodal token counting is not implemented yet.'
        );
        expect(html).toContain('Image token counting is not available');
    });
});
