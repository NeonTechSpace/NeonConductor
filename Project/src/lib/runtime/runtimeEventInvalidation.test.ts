import { afterEach, describe, expect, it, vi } from 'vitest';

const { setQueriesDataMock } = vi.hoisted(() => ({
    setQueriesDataMock: vi.fn(),
}));

vi.mock('@/web/lib/providers/trpcCore', () => ({
    queryClient: {
        setQueriesData: setQueriesDataMock,
    },
}));

import { invalidateQueriesForRuntimeEvent } from '@/web/lib/runtime/runtimeEventInvalidation';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

interface InvalidationCall {
    key: string;
    args: unknown;
}

function createInvalidateLeaf(calls: InvalidationCall[], key: string) {
    return {
        invalidate: (args?: unknown) => {
            calls.push({
                key,
                args: args ?? null,
            });
            return Promise.resolve(undefined);
        },
        setData: vi.fn(),
        getData: vi.fn(),
        prefetch: vi.fn(() => Promise.resolve(undefined)),
    };
}

const openAiSubscriptionUsageKey = 'provider.getOpenAI' + 'SubscriptionUsage';
const openAiSubscriptionRateLimitsKey = 'provider.getOpenAI' + 'SubscriptionRateLimits';

function createUtilsMock(calls: InvalidationCall[]) {
    return {
        conversation: {
            getEditPreference: createInvalidateLeaf(calls, 'conversation.getEditPreference'),
            getThreadTitlePreference: createInvalidateLeaf(calls, 'conversation.getThreadTitlePreference'),
            listBuckets: createInvalidateLeaf(calls, 'conversation.listBuckets'),
            listTags: createInvalidateLeaf(calls, 'conversation.listTags'),
            listThreads: createInvalidateLeaf(calls, 'conversation.listThreads'),
        },
        runtime: {
            getShellBootstrap: createInvalidateLeaf(calls, 'runtime.getShellBootstrap'),
            getDiagnosticSnapshot: createInvalidateLeaf(calls, 'runtime.getDiagnosticSnapshot'),
            listWorkspaceRoots: createInvalidateLeaf(calls, 'runtime.listWorkspaceRoots'),
        },
        session: {
            getAttachedSkills: createInvalidateLeaf(calls, 'session.getAttachedSkills'),
            list: createInvalidateLeaf(calls, 'session.list'),
            status: createInvalidateLeaf(calls, 'session.status'),
            listRuns: createInvalidateLeaf(calls, 'session.listRuns'),
            listMessages: createInvalidateLeaf(calls, 'session.listMessages'),
        },
        diff: {
            listByRun: createInvalidateLeaf(calls, 'diff.listByRun'),
            getFilePatch: createInvalidateLeaf(calls, 'diff.getFilePatch'),
        },
        checkpoint: {
            list: createInvalidateLeaf(calls, 'checkpoint.list'),
        },
        provider: {
            listProviders: createInvalidateLeaf(calls, 'provider.listProviders'),
            getDefaults: createInvalidateLeaf(calls, 'provider.getDefaults'),
            listModels: createInvalidateLeaf(calls, 'provider.listModels'),
            getAuthState: createInvalidateLeaf(calls, 'provider.getAuthState'),
            getAccountContext: createInvalidateLeaf(calls, 'provider.getAccountContext'),
            getConnectionProfile: createInvalidateLeaf(calls, 'provider.getConnectionProfile'),
            getModelRoutingPreference: createInvalidateLeaf(calls, 'provider.getModelRoutingPreference'),
            listModelProviders: createInvalidateLeaf(calls, 'provider.listModelProviders'),
            getUsageSummary: createInvalidateLeaf(calls, 'provider.getUsageSummary'),
            getOpenAISubscriptionUsage: createInvalidateLeaf(calls, openAiSubscriptionUsageKey),
            getOpenAISubscriptionRateLimits: createInvalidateLeaf(calls, openAiSubscriptionRateLimitsKey),
        },
        plan: {
            getActive: createInvalidateLeaf(calls, 'plan.getActive'),
        },
        orchestrator: {
            latestBySession: createInvalidateLeaf(calls, 'orchestrator.latestBySession'),
        },
        profile: {
            getExecutionPreset: createInvalidateLeaf(calls, 'profile.getExecutionPreset'),
            list: createInvalidateLeaf(calls, 'profile.list'),
            getActive: createInvalidateLeaf(calls, 'profile.getActive'),
        },
        mode: {
            list: createInvalidateLeaf(calls, 'mode.list'),
            getActive: createInvalidateLeaf(calls, 'mode.getActive'),
        },
        registry: {
            listResolved: createInvalidateLeaf(calls, 'registry.listResolved'),
            searchSkills: createInvalidateLeaf(calls, 'registry.searchSkills'),
        },
        permission: {
            listPending: createInvalidateLeaf(calls, 'permission.listPending'),
        },
        tool: {
            list: createInvalidateLeaf(calls, 'tool.list'),
        },
        mcp: {
            listServers: createInvalidateLeaf(calls, 'mcp.listServers'),
        },
        worktree: {
            list: createInvalidateLeaf(calls, 'worktree.list'),
        },
    };
}

function createEvent(input: Partial<RuntimeEventRecordV1>): RuntimeEventRecordV1 {
    return {
        sequence: 1,
        eventId: 'evt_test',
        entityType: 'runtime',
        domain: 'runtime',
        operation: 'status',
        entityId: 'runtime',
        eventType: 'test.event',
        payload: {},
        createdAt: new Date().toISOString(),
        ...input,
    };
}

function setSelectionState(profileId: string, state: { selectedSessionId?: string; selectedRunId?: string }) {
    const storage = new Map<string, string>();
    storage.set(`neonconductor.conversation.ui.${profileId}`, JSON.stringify(state));
    vi.stubGlobal('window', {
        localStorage: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value);
            },
            removeItem: (key: string) => {
                storage.delete(key);
            },
        },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    setQueriesDataMock.mockReset();
});

describe('invalidateQueriesForRuntimeEvent', () => {
    it('patches thread relation cache updates before falling back to invalidation', async () => {
        const calls: InvalidationCall[] = [];
        const utils = createUtilsMock(calls);

        await invalidateQueriesForRuntimeEvent(
            utils as never,
            createEvent({
                entityType: 'thread',
                domain: 'thread',
                operation: 'upsert',
                entityId: 'thr_1',
                payload: {
                    profileId: 'profile_default',
                    threadId: 'thr_1',
                    tagIds: ['tag_1'],
                },
            })
        );

        expect(calls).toEqual([]);
        expect(utils.runtime.getShellBootstrap.setData).toHaveBeenCalledTimes(1);
        expect(setQueriesDataMock).not.toHaveBeenCalled();
    });

    it('patches selected message queries for message part updates without refetch invalidation', async () => {
        const calls: InvalidationCall[] = [];
        const utils = createUtilsMock(calls);
        setSelectionState('profile_default', {
            selectedSessionId: 'sess_selected',
            selectedRunId: 'run_selected',
        });

        await invalidateQueriesForRuntimeEvent(
            utils as never,
            createEvent({
                entityType: 'messagePart',
                domain: 'messagePart',
                operation: 'append',
                entityId: 'part_1',
                payload: {
                    profileId: 'profile_default',
                    sessionId: 'sess_selected',
                    runId: 'run_selected',
                    part: {
                        id: 'part_1',
                        messageId: 'msg_selected',
                        sequence: 0,
                        partType: 'text',
                        payload: {
                            text: 'partial',
                        },
                        createdAt: '2026-03-12T10:00:00.000Z',
                    },
                },
            })
        );

        expect(calls).toEqual([]);
        expect(setQueriesDataMock).toHaveBeenCalledTimes(1);
    });

    it('patches started runs into run and session caches without invalidation', async () => {
        const calls: InvalidationCall[] = [];
        const utils = createUtilsMock(calls);

        await invalidateQueriesForRuntimeEvent(
            utils as never,
            createEvent({
                entityType: 'run',
                domain: 'run',
                operation: 'status',
                entityId: 'run_started',
                payload: {
                    profileId: 'profile_default',
                    sessionId: 'sess_selected',
                    run: {
                        id: 'run_started',
                        sessionId: 'sess_selected',
                        profileId: 'profile_default',
                        prompt: 'Hello',
                        status: 'running',
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                        authMethod: 'api_key',
                        transport: {
                            requestedFamily: 'auto',
                            selected: 'openai_responses',
                        },
                        cache: {
                            strategy: 'auto',
                            applied: false,
                        },
                        createdAt: '2026-03-13T10:00:00.000Z',
                        updatedAt: '2026-03-13T10:00:00.000Z',
                    },
                },
            })
        );

        expect(calls).toEqual([]);
        expect(utils.session.listRuns.setData).toHaveBeenCalledTimes(1);
        expect(utils.session.status.setData).toHaveBeenCalledTimes(1);
        expect(utils.session.list.setData).toHaveBeenCalledTimes(1);

        const listRunsUpdater = utils.session.listRuns.setData.mock.calls[0]?.[1] as
            | ((current: { runs: Array<{ id: string; status: string }> }) => { runs: Array<{ id: string; status: string }> })
            | undefined;
        expect(listRunsUpdater?.({ runs: [] }).runs[0]?.id).toBe('run_started');

        const statusUpdater = utils.session.status.setData.mock.calls[0]?.[1] as
            | ((current: { found: true; session: { id: string; runStatus: string }; activeRunId: string | null }) => {
                  found: true;
                  session: { id: string; runStatus: string };
                  activeRunId: string | null;
              })
            | undefined;
        expect(
            statusUpdater?.({
                found: true,
                session: {
                    id: 'sess_selected',
                    runStatus: 'pending',
                },
                activeRunId: null,
            }).activeRunId
        ).toBe('run_started');
    });

    it('patches terminal runs and clears activeRunId without invalidation', async () => {
        const calls: InvalidationCall[] = [];
        const utils = createUtilsMock(calls);

        await invalidateQueriesForRuntimeEvent(
            utils as never,
            createEvent({
                entityType: 'run',
                domain: 'run',
                operation: 'status',
                entityId: 'run_finished',
                eventType: 'run.failed',
                payload: {
                    profileId: 'profile_default',
                    sessionId: 'sess_selected',
                    run: {
                        id: 'run_finished',
                        sessionId: 'sess_selected',
                        profileId: 'profile_default',
                        prompt: 'Hello',
                        status: 'error',
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                        authMethod: 'api_key',
                        errorCode: 'provider_request_failed',
                        errorMessage: 'boom',
                        transport: {
                            requestedFamily: 'auto',
                            selected: 'openai_responses',
                        },
                        cache: {
                            strategy: 'auto',
                            applied: false,
                        },
                        createdAt: '2026-03-13T10:00:00.000Z',
                        updatedAt: '2026-03-13T10:01:00.000Z',
                    },
                },
            })
        );

        expect(calls).toEqual([]);

        const statusUpdater = utils.session.status.setData.mock.calls[0]?.[1] as
            | ((current: { found: true; session: { id: string; runStatus: string }; activeRunId: string | null }) => {
                  found: true;
                  session: { id: string; runStatus: string };
                  activeRunId: string | null;
              })
            | undefined;
        const nextStatus = statusUpdater?.({
            found: true,
            session: {
                id: 'sess_selected',
                runStatus: 'running',
            },
            activeRunId: 'run_finished',
        });
        expect(nextStatus?.activeRunId).toBeNull();
        expect(nextStatus?.session.runStatus).toBe('error');

        const sessionListUpdater = utils.session.list.setData.mock.calls[0]?.[1] as
            | ((current: { sessions: Array<{ id: string; runStatus: string }> }) => {
                  sessions: Array<{ id: string; runStatus: string }>;
              })
            | undefined;
        expect(
            sessionListUpdater?.({
                sessions: [
                    {
                        id: 'sess_selected',
                        runStatus: 'running',
                    },
                ],
            }).sessions[0]?.runStatus
        ).toBe('error');
    });

    it('keeps provider auth events scoped to provider queries', async () => {
        const calls: InvalidationCall[] = [];
        const utils = createUtilsMock(calls);

        await invalidateQueriesForRuntimeEvent(
            utils as never,
            createEvent({
                entityType: 'provider',
                domain: 'provider',
                operation: 'status',
                entityId: 'openai',
                payload: {
                    profileId: 'profile_default',
                    providerId: 'openai',
                    authState: 'authenticated',
                },
            })
        );

        expect(calls).toEqual([
            {
                key: 'provider.getAuthState',
                args: {
                    profileId: 'profile_default',
                    providerId: 'openai',
                },
            },
        ]);
    });

    it('invalidates plan and orchestrator slices without broad session churn', async () => {
        const planCalls: InvalidationCall[] = [];
        const planUtils = createUtilsMock(planCalls);

        await invalidateQueriesForRuntimeEvent(
            planUtils as never,
            createEvent({
                entityType: 'plan',
                domain: 'plan',
                operation: 'status',
                entityId: 'plan_1',
                payload: {
                    profileId: 'profile_default',
                    sessionId: 'sess_selected',
                    topLevelTab: 'agent',
                    runId: 'run_started',
                },
            })
        );

        expect(planCalls).toEqual([
            {
                key: 'plan.getActive',
                args: {
                    profileId: 'profile_default',
                    sessionId: 'sess_selected',
                    topLevelTab: 'agent',
                },
            },
            {
                key: 'session.listRuns',
                args: {
                    profileId: 'profile_default',
                    sessionId: 'sess_selected',
                },
            },
        ]);

        const orchestratorCalls: InvalidationCall[] = [];
        const orchestratorUtils = createUtilsMock(orchestratorCalls);
        await invalidateQueriesForRuntimeEvent(
            orchestratorUtils as never,
            createEvent({
                entityType: 'orchestrator',
                domain: 'orchestrator',
                operation: 'status',
                entityId: 'orch_1',
                payload: {
                    profileId: 'profile_default',
                    sessionId: 'sess_selected',
                },
            })
        );

        expect(orchestratorCalls).toEqual([
            {
                key: 'orchestrator.latestBySession',
                args: {
                    profileId: 'profile_default',
                    sessionId: 'sess_selected',
                },
            },
        ]);
    });

    it('keeps diagnostic snapshot invalidation limited to runtime reset', async () => {
        const calls: InvalidationCall[] = [];
        const utils = createUtilsMock(calls);

        await invalidateQueriesForRuntimeEvent(
            utils as never,
            createEvent({
                entityType: 'runtime',
                domain: 'runtime',
                operation: 'reset',
                entityId: 'runtime',
            })
        );

        expect(calls.some((call) => call.key === 'runtime.getDiagnosticSnapshot')).toBe(true);
        expect(calls.some((call) => call.key === 'runtime.getShellBootstrap')).toBe(true);
        expect(calls.some((call) => call.key === 'session.listMessages')).toBe(true);
        expect(calls.some((call) => call.key === 'provider.listModels')).toBe(true);
        expect(calls.some((call) => call.key === 'mode.list')).toBe(true);
        expect(calls.some((call) => call.key === 'registry.listResolved')).toBe(true);
    });
});
