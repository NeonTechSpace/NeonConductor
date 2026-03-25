import { skipToken } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
    buildConversationActivePlanQueryInput,
    buildConversationAttachedRegistryQueryInput,
    buildConversationOrchestratorLatestQueryInput,
    buildConversationRunScopedQueryInput,
    buildConversationSessionScopedQueryInput,
} from '@/web/components/conversation/shell/queries/useConversationQueries';
import { buildConversationComposerPresentationState } from '@/web/components/conversation/shell/useConversationShellComposerSetup';
import { buildResolvedContextStateQueryInput } from '@/web/components/conversation/shell/useConversationShellController';
import { buildConversationReasoningState } from '@/web/components/conversation/shell/useConversationShellRunTargetState';
import { buildDiffPatchPreviewQueryInput } from '@/web/components/conversation/panels/diffCheckpointPanel/useDiffCheckpointPanelController';

describe('conversation query input builders', () => {
    it('returns skipToken for session-scoped queries until a real session id exists', () => {
        expect(buildConversationSessionScopedQueryInput('profile_default', undefined)).toBe(skipToken);
        expect(buildConversationSessionScopedQueryInput('profile_default', 'not_a_session')).toBe(skipToken);
        expect(buildConversationSessionScopedQueryInput('profile_default', 'sess_real')).toEqual({
            profileId: 'profile_default',
            sessionId: 'sess_real',
        });
    });

    it('returns skipToken for run-scoped queries until a real run id exists', () => {
        expect(buildConversationRunScopedQueryInput('profile_default', undefined)).toBe(skipToken);
        expect(buildConversationRunScopedQueryInput('profile_default', 'not_a_run')).toBe(skipToken);
        expect(buildConversationRunScopedQueryInput('profile_default', 'run_real')).toEqual({
            profileId: 'profile_default',
            runId: 'run_real',
        });
    });

    it('only enables attached registry, active plan, and orchestrator inputs for real session-backed states', () => {
        expect(
            buildConversationAttachedRegistryQueryInput({
                profileId: 'profile_default',
                selectedSessionId: undefined,
                topLevelTab: 'agent',
                modeKey: 'code',
            })
        ).toBe(skipToken);
        expect(
            buildConversationAttachedRegistryQueryInput({
                profileId: 'profile_default',
                selectedSessionId: 'sess_real',
                topLevelTab: 'chat',
                modeKey: 'chat',
            })
        ).toBe(skipToken);
        expect(
            buildConversationAttachedRegistryQueryInput({
                profileId: 'profile_default',
                selectedSessionId: 'sess_real',
                topLevelTab: 'agent',
                modeKey: 'code',
            })
        ).toEqual({
            profileId: 'profile_default',
            sessionId: 'sess_real',
            topLevelTab: 'agent',
            modeKey: 'code',
        });

        expect(
            buildConversationActivePlanQueryInput({
                profileId: 'profile_default',
                selectedSessionId: undefined,
                topLevelTab: 'agent',
            })
        ).toBe(skipToken);
        expect(
            buildConversationActivePlanQueryInput({
                profileId: 'profile_default',
                selectedSessionId: 'sess_real',
                topLevelTab: 'agent',
            })
        ).toEqual({
            profileId: 'profile_default',
            sessionId: 'sess_real',
            topLevelTab: 'agent',
        });

        expect(
            buildConversationOrchestratorLatestQueryInput({
                profileId: 'profile_default',
                selectedSessionId: 'sess_real',
                topLevelTab: 'chat',
            })
        ).toBe(skipToken);
        expect(
            buildConversationOrchestratorLatestQueryInput({
                profileId: 'profile_default',
                selectedSessionId: 'sess_real',
                topLevelTab: 'orchestrator',
            })
        ).toEqual({
            profileId: 'profile_default',
            sessionId: 'sess_real',
        });
    });
});

describe('resolved context state input builder', () => {
    it('returns skipToken until a real session exists and otherwise uses the existing provider/model fallbacks', () => {
        expect(
            buildResolvedContextStateQueryInput({
                profileId: 'profile_default',
                selectedSessionId: undefined,
                providerId: undefined,
                modelId: undefined,
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: undefined,
                selectedRunId: undefined,
            })
        ).toBe(skipToken);

        expect(
            buildResolvedContextStateQueryInput({
                profileId: 'profile_default',
                selectedSessionId: 'sess_real',
                providerId: undefined,
                modelId: undefined,
                topLevelTab: 'agent',
                modeKey: 'code',
                workspaceFingerprint: 'ws_real',
                selectedRunId: 'run_real',
            })
        ).toEqual({
            profileId: 'profile_default',
            sessionId: 'sess_real',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint: 'ws_real',
            runId: 'run_real',
        });
    });
});

describe('conversation reasoning state builder', () => {
    it('keeps a supported requested reasoning effort for Kilo models', () => {
        const reasoningState = buildConversationReasoningState({
            modelsByProvider: new Map([
                [
                    'kilo',
                    [
                        {
                            id: 'kilo/model',
                            features: {
                                supportsReasoning: true,
                            },
                            reasoningEfforts: ['low', 'medium', 'high'],
                        },
                    ],
                ],
            ]),
            selectedComposerProviderId: 'kilo',
            selectedComposerModelId: 'kilo/model',
            requestedReasoningEffort: 'high',
        });

        expect(reasoningState.selectedModelSupportsReasoning).toBe(true);
        expect(reasoningState.supportedReasoningEfforts).toEqual(['low', 'medium', 'high']);
        expect(reasoningState.effectiveReasoningEffort).toBe('high');
        expect(reasoningState.runtimeOptions.reasoning.effort).toBe('high');
    });

    it('fails closed to no reasoning when the requested Kilo effort is unsupported', () => {
        const reasoningState = buildConversationReasoningState({
            modelsByProvider: new Map([
                [
                    'kilo',
                    [
                        {
                            id: 'kilo/model',
                            features: {
                                supportsReasoning: true,
                            },
                            reasoningEfforts: ['low'],
                        },
                    ],
                ],
            ]),
            selectedComposerProviderId: 'kilo',
            selectedComposerModelId: 'kilo/model',
            requestedReasoningEffort: 'high',
        });

        expect(reasoningState.effectiveReasoningEffort).toBe('none');
        expect(reasoningState.runtimeOptions.reasoning.effort).toBe('none');
    });
});

describe('conversation composer presentation state builder', () => {
    it('uses the selected option for compatibility and vision-derived attachment state', () => {
        const presentationState = buildConversationComposerPresentationState({
            imageAttachmentsAllowed: true,
            pendingImageCount: 1,
            composerModelOptions: [
                {
                    providerId: 'openai',
                    id: 'gpt-5',
                    supportsVision: false,
                    compatibilityState: 'incompatible',
                    compatibilityReason: 'This mode requires native tool calling.',
                },
            ],
            selectedComposerProviderId: 'openai',
            selectedComposerModelId: 'gpt-5',
            selectedModelOptionForComposer: undefined,
        });

        expect(presentationState.canAttachImages).toBe(false);
        expect(presentationState.imageAttachmentBlockedReason).toBe('This model cannot accept image attachments.');
        expect(presentationState.selectedModelCompatibilityState).toBe('incompatible');
        expect(presentationState.selectedModelCompatibilityReason).toBe(
            'This mode requires native tool calling.'
        );
    });
});

describe('diff patch preview input builder', () => {
    it('returns skipToken until both a real diff and selected path exist', () => {
        expect(
            buildDiffPatchPreviewQueryInput({
                profileId: 'profile_default',
                selectedDiff: undefined,
                resolvedSelectedPath: undefined,
            })
        ).toBe(skipToken);

        expect(
            buildDiffPatchPreviewQueryInput({
                profileId: 'profile_default',
                selectedDiff: {
                    id: 'diff_real',
                    profileId: 'profile_default',
                    sessionId: 'sess_real',
                    runId: 'run_real',
                    summary: 'Diff',
                    artifact: {
                        kind: 'git',
                        workspaceRootPath: 'C:\\repo',
                        workspaceLabel: 'Repo',
                        baseRef: 'HEAD',
                        fileCount: 1,
                        files: [{ path: 'src/app.ts', status: 'modified' }],
                        fullPatch: 'diff --git a/src/app.ts b/src/app.ts',
                        patchesByPath: {
                            'src/app.ts': 'diff --git a/src/app.ts b/src/app.ts',
                        },
                    },
                    createdAt: '2026-03-10T10:00:00.000Z',
                    updatedAt: '2026-03-10T10:00:00.000Z',
                },
                resolvedSelectedPath: 'src/app.ts',
            })
        ).toEqual({
            profileId: 'profile_default',
            diffId: 'diff_real',
            path: 'src/app.ts',
        });
    });
});
