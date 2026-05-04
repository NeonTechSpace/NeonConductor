import { describe, expect, it } from 'vitest';

import {
    buildCloudSessionSyncBackDiagnostic,
    buildContextSummaryDiagnostics,
    buildMemoryTruthDiagnostics,
    buildRegistryDiscoveryDiagnostics,
    buildRunContractPreviewDiagnostics,
    buildRuntimeCapabilityIssueDiagnostic,
} from '@/web/lib/operatorDiagnostics';

import type { RegistryDiscoveryDiagnostic, RunContractPreview } from '@/shared/contracts';

function createRunContractPreview(overrides: Partial<RunContractPreview> = {}): RunContractPreview {
    return {
        steeringSnapshot: {
            profileId: 'profile_default',
            sessionId: 'sess_default',
            topLevelTab: 'agent',
            modeKey: 'code',
            providerId: 'kilo',
            modelId: 'kilo/gpt-5',
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            createdAt: '2026-04-30T10:00:00.000Z',
        },
        executionTarget: {
            kind: 'workspace',
            label: 'Workspace',
            materializationState: 'materialized',
        },
        preparedContext: {
            contributors: [],
            digest: {
                fullDigest: 'runctx',
                contributorDigest: 'ctxcontributors',
                cacheabilityHint: 'cacheable',
                checkpoints: {
                    bootstrap: {
                        checkpoint: 'bootstrap',
                        includedContributorCount: 0,
                        excludedContributorCount: 0,
                        digest: 'ctxchk-bootstrap',
                        active: true,
                    },
                    post_compaction_reseed: {
                        checkpoint: 'post_compaction_reseed',
                        includedContributorCount: 0,
                        excludedContributorCount: 0,
                        digest: 'ctxchk-post',
                        active: false,
                    },
                },
            },
            activeContributorCount: 0,
            compactionReseedActive: false,
        },
        cache: {
            digest: 'runctx',
            strategy: 'auto',
            cacheabilityHint: 'cacheable',
        },
        trustSummary: {
            contributorCountByTrustLevel: {
                trusted_instruction: 0,
                user_input: 1,
                workspace_content: 0,
                external_untrusted: 0,
                promoted_fact: 0,
            },
            contributorCountByInstructionAuthority: {
                instruct: 0,
                contextualize: 1,
                retrieval_only: 0,
            },
        },
        dynamicExpansionSummary: {
            resolvedCount: 0,
            blockedCount: 0,
            omittedCount: 0,
            failedCount: 0,
            invalidCount: 0,
        },
        attachmentSummary: {
            totalCount: 0,
            imageAttachmentCount: 0,
            textFileAttachmentCount: 0,
            totalByteSize: 0,
        },
        ...overrides,
    };
}

describe('operator diagnostics', () => {
    it('reuses runtime capability issue formatting for run rejections', () => {
        const diagnostic = buildRuntimeCapabilityIssueDiagnostic({
            issue: {
                code: 'cloud_session_contract_unavailable',
                detail: 'kilo_harness_contract_missing',
            },
        });

        expect(diagnostic.tone).toBe('error');
        expect(diagnostic.title).toBe('Run cannot start');
        expect(diagnostic.detail).toContain('Kilo-owned cloud harness');
        expect(diagnostic.detail).toContain('Neon will not create local checkpoints');
    });

    it('maps material contract drift, dynamic failures, PDFs, and read-guard counts', () => {
        const diagnostics = buildRunContractPreviewDiagnostics(
            createRunContractPreview({
                dynamicExpansionSummary: {
                    resolvedCount: 1,
                    blockedCount: 1,
                    omittedCount: 0,
                    failedCount: 1,
                    invalidCount: 0,
                },
                attachmentSummary: {
                    totalCount: 2,
                    imageAttachmentCount: 0,
                    textFileAttachmentCount: 1,
                    documentAttachmentCount: 1,
                    totalByteSize: 100,
                    readGuardBlockedCount: 1,
                    readGuardDecisionReasons: {
                        blocked_secret_pattern: 1,
                    },
                },
                documentSummary: [
                    {
                        documentArtifactId: 'doc_blocked',
                        fileName: 'scanned.pdf',
                        mimeType: 'application/pdf',
                        byteSize: 100,
                        extractionState: 'empty',
                        contextMode: 'selected_text',
                        countingState: 'exact_text_estimate',
                        selectedPageRanges: [],
                        selectedTokenCount: 0,
                        selectedTextByteSize: 0,
                        omittedPageCount: 3,
                        blockedReason: 'no_extractable_text',
                    },
                ],
                diffFromLastCompatible: {
                    compatible: false,
                    hasMaterialChanges: true,
                    items: [
                        {
                            field: 'executionTargetKind',
                            reason: 'The resolved execution target kind changed.',
                            material: true,
                        },
                    ],
                },
            })
        );

        expect(diagnostics.map((diagnostic) => diagnostic.title)).toEqual([
            'Dynamic skill context needs attention',
            'Some attachments were blocked by file-read policy',
            'PDF document cannot be included',
            'Run contract changed before execution',
        ]);
        expect(diagnostics[0]?.tone).toBe('error');
        expect(diagnostics[1]?.detail).not.toContain('.env');
        expect(diagnostics[2]?.detail).toContain('scanned.pdf');
        expect(diagnostics[3]?.metadata?.[0]).toMatchObject({
            label: 'executionTargetKind',
            value: 'The resolved execution target kind changed.',
        });
    });

    it('maps fail-closed sandbox diagnostics into run contract diagnostics', () => {
        const diagnostics = buildRunContractPreviewDiagnostics(
            createRunContractPreview({
                sandboxPolicySummary: {
                    filesystem: {
                        kind: 'scheduled_managed_sandbox',
                        effectiveRootLabel: 'Workspace',
                        effectiveRootPath: 'C:\\Workspace',
                        writable: true,
                        managedByNeon: true,
                        failClosedOnMissingTarget: true,
                    },
                    network: {
                        kind: 'not_restricted',
                        restricted: false,
                        reviewRequired: false,
                        blockedNetworkVisible: false,
                        reason: 'Network is not restricted.',
                    },
                    process: {
                        state: 'unsupported',
                        platform: 'win32',
                        mechanism: 'managed_directory',
                        nativeEnforcement: false,
                        reason: 'Native process sandbox helpers are future work.',
                    },
                    diagnostics: [
                        {
                            code: 'managed_sandbox_scheduled',
                            severity: 'info',
                            message: 'A managed sandbox is scheduled and must materialize successfully at run start.',
                            failClosed: true,
                        },
                    ],
                },
            })
        );

        expect(diagnostics).toContainEqual(
            expect.objectContaining({
                tone: 'info',
                title: 'Sandbox policy can block execution',
                detail: 'A managed sandbox is scheduled and must materialize successfully at run start.',
            })
        );
    });

    it('maps context counting and dynamic skill gaps into actionable diagnostics', () => {
        const diagnostics = buildContextSummaryDiagnostics({
            missingReason: 'multimodal_counting_unavailable',
            blockedDynamicSkillContributorCount: 2,
        });

        expect(diagnostics).toHaveLength(2);
        expect(diagnostics[0]).toMatchObject({
            tone: 'warning',
            title: 'Image token counting is not available',
        });
        expect(diagnostics[1]?.detail).toContain('2 dynamic skill contributors');
    });

    it('keeps registry paths to intended relative diagnostics only', () => {
        const diagnostic: RegistryDiscoveryDiagnostic = {
            id: 'diag_1',
            assetKind: 'skills',
            scope: 'workspace',
            relativePath: 'skills/bad/SKILL.md',
            severity: 'error',
            code: 'invalid_package_layout',
            message: 'Skill package is missing required metadata.',
            createdAt: '2026-04-30T10:00:00.000Z',
            updatedAt: '2026-04-30T10:00:00.000Z',
        };

        const diagnostics = buildRegistryDiscoveryDiagnostics([diagnostic]);

        expect(diagnostics[0]).toMatchObject({
            tone: 'error',
            title: 'Skills discovery problem',
            detail: 'Skill package is missing required metadata.',
        });
        expect(diagnostics[0]?.metadata).toContainEqual({
            label: 'Path',
            value: 'skills/bad/SKILL.md',
        });
    });

    it('preserves the Kilo-owned sync-back boundary', () => {
        const diagnostic = buildCloudSessionSyncBackDiagnostic({
            state: 'not_available',
            reason: 'kilo_owned_remote_workspace',
        });

        expect(diagnostic.title).toBe('Remote workspace sync-back is not available');
        expect(diagnostic.detail).toContain('Kilo owns remote workspace state');
        expect(diagnostic.detail).toContain('Neon records local provenance only');
    });

    it('maps memory current-truth conflicts as warnings', () => {
        const diagnostics = buildMemoryTruthDiagnostics({
            hasConflictingCurrentTruth: true,
            memoryId: 'mem_old',
            currentTruthMemoryId: 'mem_current',
        });

        expect(diagnostics).toHaveLength(2);
        expect(diagnostics.every((diagnostic) => diagnostic.tone === 'warning')).toBe(true);
        expect(diagnostics[0]?.title).toBe('Conflicting current truth detected');
        expect(diagnostics[1]?.detail).toContain('mem_current');
    });
});
