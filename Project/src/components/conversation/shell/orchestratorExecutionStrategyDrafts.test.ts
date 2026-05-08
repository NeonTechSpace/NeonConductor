import { describe, expect, it } from 'vitest';

import {
    resolveOrchestratorExecutionStrategyDraft,
    resolveOrchestratorStrategyRootThreadId,
    updateOrchestratorExecutionStrategyDraft,
} from '@/web/components/conversation/shell/orchestratorExecutionStrategyDrafts';

describe('orchestratorExecutionStrategyDrafts', () => {
    it('defaults to sequential when the selected root orchestrator thread has no draft', () => {
        expect(
            resolveOrchestratorExecutionStrategyDraft({
                topLevelTab: 'orchestrator',
                selectedThread: {
                    id: 'thr_root',
                    rootThreadId: 'thr_root',
                    topLevelTab: 'orchestrator',
                } as never,
                draftsByRootThreadId: {},
            })
        ).toBe('sequential');
    });

    it('resolves a stored draft for the selected root orchestrator thread only', () => {
        expect(
            resolveOrchestratorExecutionStrategyDraft({
                topLevelTab: 'orchestrator',
                selectedThread: {
                    id: 'thr_root_b',
                    rootThreadId: 'thr_root_b',
                    topLevelTab: 'orchestrator',
                } as never,
                draftsByRootThreadId: {
                    thr_root_a: 'parallel',
                    thr_root_b: 'sequential',
                },
            })
        ).toBe('sequential');
    });

    it('ignores delegated child lanes when resolving the root-thread draft key', () => {
        expect(
            resolveOrchestratorStrategyRootThreadId({
                topLevelTab: 'orchestrator',
                selectedThread: {
                    id: 'thr_child',
                    rootThreadId: 'thr_root',
                    topLevelTab: 'agent',
                    delegatedFromOrchestratorRunId: 'orch_1',
                } as never,
            })
        ).toBeUndefined();
    });

    it('writes strategy drafts by root thread id', () => {
        expect(
            updateOrchestratorExecutionStrategyDraft({
                draftsByRootThreadId: {
                    thr_root_a: 'parallel',
                },
                rootThreadId: 'thr_root_b',
                executionStrategy: 'sequential',
            })
        ).toEqual({
            thr_root_a: 'parallel',
            thr_root_b: 'sequential',
        });
    });
});
