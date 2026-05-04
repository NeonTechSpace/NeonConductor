import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { WorkbenchApprovalRow } from '@/web/components/conversation/panels/workbenchApprovalRow';
import {
    WorkbenchDiffSummaryRow,
    WorkbenchFileChangeRows,
} from '@/web/components/conversation/panels/workbenchDiffRows';
import { WorkbenchExecutionReceiptRow } from '@/web/components/conversation/panels/workbenchExecutionReceiptRow';

import type { PermissionRecord } from '@/app/backend/persistence/types';

import type { DiffOverview, ExecutionReceipt } from '@/shared/contracts';

describe('workbench row components', () => {
    it('renders approval actions and candidate selection from a permission request', () => {
        const request: PermissionRecord = {
            id: 'perm_shell',
            profileId: 'profile_default',
            policy: 'ask',
            resource: 'shell:exact:pnpm test',
            toolId: 'run_command',
            workspaceFingerprint: 'ws_alpha',
            scopeKind: 'tool',
            summary: {
                title: 'Allow shell command',
                detail: 'pnpm test needs approval.',
            },
            commandText: 'pnpm test',
            approvalCandidates: [
                {
                    label: 'Exact command',
                    resource: 'shell:exact:pnpm test',
                },
            ],
            decision: 'pending',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        };

        const html = renderToStaticMarkup(
            <WorkbenchApprovalRow
                request={request}
                workspaceInfo={{ label: 'Alpha', absolutePath: 'C:/repo' }}
                busy={false}
                onResolve={vi.fn()}
            />
        );

        expect(html).toContain('Allow shell command');
        expect(html).toContain('Save Approval As');
        expect(html).toContain('Allow Workspace');
        expect(html).toContain('aria-expanded="true"');
    });

    it('renders diff and file-change rows from current diff overview data', () => {
        const overview: Extract<DiffOverview, { kind: 'git' }> = {
            kind: 'git',
            fileCount: 2,
            summary: '2 changed files',
            totalAddedLines: 10,
            totalDeletedLines: 3,
            statusCounts: {
                added: 1,
                modified: 1,
                deleted: 0,
                renamed: 0,
                copied: 0,
                type_changed: 0,
                untracked: 0,
            },
            topDirectories: [{ directory: 'src', fileCount: 2, addedLines: 10, deletedLines: 3 }],
            highlightedFiles: [
                { path: 'src/app.ts', status: 'modified', addedLines: 8, deletedLines: 3 },
                { path: 'src/new.ts', status: 'added', addedLines: 2 },
            ],
        };

        const summaryHtml = renderToStaticMarkup(<WorkbenchDiffSummaryRow overview={overview} />);
        const fileHtml = renderToStaticMarkup(<WorkbenchFileChangeRows overview={overview} />);

        expect(summaryHtml).toContain('Diff summary');
        expect(summaryHtml).toContain('2 changed files');
        expect(summaryHtml).toContain('10 added');
        expect(fileHtml).toContain('src/app.ts');
        expect(fileHtml).toContain('modified');
        expect(fileHtml).toContain('aria-expanded="false"');
    });

    it('renders immutable execution receipt facts without mutation controls', () => {
        const receipt: ExecutionReceipt = {
            id: 'rcpt_default',
            profileId: 'profile_default',
            sessionId: 'sess_default',
            runId: 'run_default',
            contract: {
                steeringSnapshot: {
                    profileId: 'profile_default',
                    sessionId: 'sess_default',
                    topLevelTab: 'agent',
                    modeKey: 'agent',
                    providerId: 'openai',
                    modelId: 'gpt-test',
                    runtimeOptions: {
                        reasoning: {
                            effort: 'medium',
                            summary: 'auto',
                            includeEncrypted: false,
                        },
                        cache: { strategy: 'auto' },
                        transport: { family: 'auto' },
                    },
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
                executionTarget: {
                    kind: 'detached',
                    label: 'Detached',
                    materializationState: 'not_required',
                },
                preparedContext: {
                    activeContributorCount: 1,
                    compactionReseedActive: false,
                    digest: {
                        fullDigest: 'runctx-1',
                        contributorDigest: 'ctxcontributors-1',
                        checkpoints: {
                            bootstrap: {
                                checkpoint: 'bootstrap',
                                includedContributorCount: 1,
                                excludedContributorCount: 0,
                                digest: 'ctxchk-bootstrap-1',
                                active: true,
                            },
                            post_compaction_reseed: {
                                checkpoint: 'post_compaction_reseed',
                                includedContributorCount: 0,
                                excludedContributorCount: 0,
                                digest: 'ctxchk-post-1',
                                active: false,
                            },
                        },
                        cacheabilityHint: 'cacheable',
                    },
                    contributors: [],
                },
                cache: {
                    digest: 'digest',
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
                        instruct: 1,
                        contextualize: 0,
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
            },
            approvalsUsed: [{ permissionRequestId: 'perm_default', scope: 'once', resource: 'shell:exact:test' }],
            toolsInvoked: [{ toolName: 'run_command', callCount: 1 }],
            memoryHitCount: 2,
            cacheResult: { applied: false, reason: 'miss' },
            usageSummary: { latencyMs: 1250, totalTokens: 42 },
            terminalOutcome: { kind: 'completed' },
            createdAt: '2026-01-01T00:00:00.000Z',
        };

        const html = renderToStaticMarkup(<WorkbenchExecutionReceiptRow receipt={receipt} />);

        expect(html).toContain('Execution receipt');
        expect(html).toContain('Outcome: completed');
        expect(html).toContain('Approvals used: 1');
        expect(html).toContain('Tools invoked: 1');
        expect(html).toContain('1.3 s');
        expect(html).not.toContain('Allow Once');
    });
});
