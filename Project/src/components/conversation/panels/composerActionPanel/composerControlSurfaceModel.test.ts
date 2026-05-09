import { describe, expect, it } from 'vitest';

import { buildComposerControlSurfaceModel } from '@/web/components/conversation/panels/composerActionPanel/composerControlSurfaceModel';

import type { BuildComposerControlSurfaceModelInput } from '@/web/components/conversation/panels/composerActionPanel/composerControlSurfaceModel';

function createInput(
    input: Partial<BuildComposerControlSurfaceModelInput> = {}
): BuildComposerControlSurfaceModelInput {
    return {
        pendingImages: [],
        pendingTextFiles: [],
        pendingDocuments: [],
        readyComposerAttachments: [],
        hasBlockingPendingAttachments: false,
        attachedRules: [],
        missingAttachedRuleKeys: [],
        attachedSkills: [],
        missingAttachedSkillKeys: [],
        inspectorSectionIds: ['pending-permissions'],
        canOpenBrowserSurface: false,
        selectedProviderId: 'openai',
        selectedModelId: 'openai/gpt-5',
        modelOptions: [
            {
                id: 'openai/gpt-5',
                label: 'GPT-5',
                supportsTools: true,
                supportsVision: true,
                supportsReasoning: true,
                capabilityBadges: [],
                compatibilityState: 'compatible',
                providerId: 'openai',
                providerLabel: 'OpenAI',
            },
        ],
        activeModeKey: 'code',
        activeModeLabel: 'Code',
        reasoningEffort: 'high',
        pendingPermissionCount: 0,
        showRunContractPreview: true,
        canQueuePrompt: true,
        isSubmitting: false,
        ...input,
    };
}

function readValue(input: BuildComposerControlSurfaceModelInput, itemId: string): string {
    const item = buildComposerControlSurfaceModel(input).items.find((candidate) => candidate.id === itemId);
    if (!item) {
        throw new Error(`Missing item ${itemId}`);
    }
    return item.value;
}

describe('composer control surface model', () => {
    it('summarizes ready and preparing file attachments', () => {
        const model = buildComposerControlSurfaceModel(
            createInput({
                pendingImages: [
                    {
                        clientId: 'img_ready',
                        fileName: 'ready.png',
                        previewUrl: 'blob:ready',
                        status: 'ready',
                    },
                    {
                        clientId: 'img_pending',
                        fileName: 'pending.png',
                        previewUrl: 'blob:pending',
                        status: 'compressing',
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
                hasBlockingPendingAttachments: true,
            })
        );

        const files = model.items.find((item) => item.id === 'files');
        expect(files?.value).toBe('1 ready / 2 files');
        expect(files?.tone).toBe('attention');
        expect(files?.action).toEqual({ kind: 'open-file-picker' });
    });

    it('projects context assets and missing attached asset warnings', () => {
        const model = buildComposerControlSurfaceModel(
            createInput({
                inspectorSectionIds: ['context-assets', 'pending-permissions'],
                attachedRules: [
                    {
                        id: 'rule_1',
                        assetKey: 'rules/review',
                        name: 'Review',
                        profileId: 'profile_default',
                        scope: 'workspace',
                        source: 'workspace',
                        sourceKind: 'workspace_file',
                        targetKind: 'shared',
                        relativeRootPath: 'rules/shared/review.md',
                        bodyMarkdown: '',
                        activationMode: 'manual',
                        enabled: true,
                        precedence: 1,
                        createdAt: '2026-01-01T00:00:00.000Z',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                    },
                ],
                missingAttachedSkillKeys: ['skills/missing'],
            })
        );

        const contextAssets = model.items.find((item) => item.id === 'context-assets');
        expect(contextAssets?.value).toBe('1 rules / 0 skills');
        expect(contextAssets?.tone).toBe('attention');
        expect(contextAssets?.action).toEqual({ kind: 'open-inspector-section', sectionId: 'context-assets' });
    });

    it('summarizes browser packets and opens the browser surface', () => {
        const model = buildComposerControlSurfaceModel(
            createInput({
                canOpenBrowserSurface: true,
                browserContextSummary: {
                    targetUrl: 'http://localhost:5173',
                    targetLabel: 'Local app',
                    commentCount: 2,
                    selectedElementCount: 1,
                    captureCount: 3,
                    enrichmentMode: 'dom_only',
                    designerDraftCount: 1,
                    designerPatchCount: 0,
                    designDiagnosticCount: 0,
                    designDiagnosticErrorCount: 0,
                    designDiagnosticWarningCount: 0,
                    designerApplyIntentStatus: 'none',
                    digest: 'browserctx-test',
                },
            })
        );

        const browser = model.items.find((item) => item.id === 'browser-context');
        expect(browser?.value).toBe('2 comments / 1 elements');
        expect(browser?.tone).toBe('success');
        expect(browser?.action).toEqual({ kind: 'open-browser-surface' });
    });

    it('keeps terminal context explicitly deferred to Phase 15F', () => {
        expect(readValue(createInput(), 'terminal-context')).toBe('No selection');
        const terminal = buildComposerControlSurfaceModel(createInput()).items.find(
            (item) => item.id === 'terminal-context'
        );
        expect(terminal?.detail).toContain('Phase 15F');
        expect(terminal?.action).toBeUndefined();
    });

    it('prioritizes pending approvals and plan questions', () => {
        const model = buildComposerControlSurfaceModel(
            createInput({
                inspectorSectionIds: ['pending-permissions', 'plan-and-orchestration'],
                pendingPermissionCount: 2,
                planControlSummary: {
                    status: 'awaiting_answers',
                    requiredQuestionCount: 3,
                    unansweredRequiredQuestionCount: 1,
                    optionalQuestionCount: 1,
                },
            })
        );

        expect(model.items.find((item) => item.id === 'approvals')).toMatchObject({
            value: '2 approvals',
            tone: 'attention',
        });
        expect(model.items.find((item) => item.id === 'questions')).toMatchObject({
            value: '1 required open',
            tone: 'attention',
        });
    });

    it('summarizes the selected model, mode, reasoning, and run intent', () => {
        const model = buildComposerControlSurfaceModel(createInput({ canQueuePrompt: false, isSubmitting: true }));

        expect(model.items.find((item) => item.id === 'model-role')).toMatchObject({
            value: 'GPT-5',
            detail: 'openai · Code · reasoning high',
        });
        expect(model.items.find((item) => item.id === 'run-intent')).toMatchObject({
            value: 'Starting',
            tone: 'attention',
        });
    });
});
