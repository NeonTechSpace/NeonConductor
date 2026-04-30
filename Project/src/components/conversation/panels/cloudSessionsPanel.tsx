import { Cloud, Download, GitFork, PlayCircle, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { OperatorDiagnosticList } from '@/web/components/ui/operatorDiagnosticList';
import {
    buildCloudSessionPrerequisiteDiagnostics,
    buildCloudSessionSyncBackDiagnostic,
} from '@/web/lib/operatorDiagnostics';
import { trpc } from '@/web/trpc/client';

import type {
    CloudSessionSummaryRecord,
    SessionSummaryRecord,
    ThreadListRecord,
} from '@/app/backend/persistence/types';

import {
    canContinueCloudSessionAuthorityState,
    formatCloudSessionAuthorityState,
    formatCloudSessionSyncBackExpectation,
    type EntityId,
} from '@/shared/contracts';

interface CloudSessionsPanelProps {
    profileId: string;
    threadId: EntityId<'thr'>;
    selectedSessionId?: EntityId<'sess'>;
    onSelectSession: (sessionId: EntityId<'sess'>) => void;
    onCloudSessionCreated: (input: { session: SessionSummaryRecord; thread?: ThreadListRecord }) => void;
}

type FeedbackTone = 'info' | 'success' | 'error';

type CloudSessionMutationResult = {
    ok: boolean;
    message: string;
    session?: SessionSummaryRecord;
    thread?: ThreadListRecord;
};

function formatAuthorityState(value: CloudSessionSummaryRecord['authorityState']): string {
    return formatCloudSessionAuthorityState(value);
}

function formatRemoteRecordSyncState(value: CloudSessionSummaryRecord['syncState']): string {
    return `Remote record ${value.replaceAll('_', ' ')}`;
}

function formatRemoteDate(value: string | undefined): string {
    if (!value) {
        return 'Remote date unavailable';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}

function CloudSessionRecordRow(input: {
    record: CloudSessionSummaryRecord;
    selected: boolean;
    busy: boolean;
    canContinue: boolean;
    onSelectLocal: (sessionId: EntityId<'sess'>) => void;
    onFork: (record: CloudSessionSummaryRecord) => void;
    onContinue: (record: CloudSessionSummaryRecord) => void;
}) {
    const title = input.record.title ?? input.record.remoteSessionId;
    const localSessionId = input.record.localSessionId;
    const canContinueRecord = input.canContinue && canContinueCloudSessionAuthorityState(input.record.authorityState);
    const syncBackDiagnostics = [buildCloudSessionSyncBackDiagnostic(input.record.syncBackExpectation)];

    return (
        <article className='border-border/70 bg-background/80 space-y-3 rounded-xl border p-3'>
            <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold'>{title}</p>
                    <p className='text-muted-foreground mt-1 truncate text-xs'>{input.record.remoteSessionId}</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        {formatRemoteDate(input.record.remoteUpdatedAt)}
                    </p>
                </div>
                <div className='flex shrink-0 flex-col items-end gap-1'>
                    <span className='border-border bg-card rounded-full border px-2 py-0.5 text-[11px] capitalize'>
                        {formatAuthorityState(input.record.authorityState)}
                    </span>
                    <span className='text-muted-foreground text-[11px] capitalize'>
                        {formatRemoteRecordSyncState(input.record.syncState)}
                    </span>
                </div>
            </div>
            <div className='text-muted-foreground grid gap-1 text-xs'>
                <span>Scope {input.record.remoteScopeKey}</span>
                {localSessionId ? <span>Local {localSessionId}</span> : <span>Remote snapshot only</span>}
                <span>{formatCloudSessionSyncBackExpectation(input.record.syncBackExpectation)}</span>
            </div>
            <OperatorDiagnosticList diagnostics={syncBackDiagnostics} compact />
            <div className='flex flex-wrap gap-2'>
                {localSessionId ? (
                    <Button
                        type='button'
                        size='sm'
                        variant={input.selected ? 'secondary' : 'outline'}
                        className='h-8 rounded-full'
                        disabled={input.busy}
                        onClick={() => {
                            input.onSelectLocal(localSessionId);
                        }}>
                        <Cloud className='mr-1.5 h-3.5 w-3.5' />
                        {input.selected ? 'Selected' : 'Select'}
                    </Button>
                ) : null}
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='h-8 rounded-full'
                    disabled={input.busy}
                    onClick={() => {
                        input.onFork(input.record);
                    }}>
                    <GitFork className='mr-1.5 h-3.5 w-3.5' />
                    Fork
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='h-8 rounded-full'
                    disabled={input.busy || !canContinueRecord}
                    onClick={() => {
                        input.onContinue(input.record);
                    }}>
                    <PlayCircle className='mr-1.5 h-3.5 w-3.5' />
                    Continue
                </Button>
            </div>
        </article>
    );
}

export function CloudSessionsPanel({
    profileId,
    threadId,
    selectedSessionId,
    onSelectSession,
    onCloudSessionCreated,
}: CloudSessionsPanelProps) {
    const [searchValue, setSearchValue] = useState('');
    const [importRemoteSessionId, setImportRemoteSessionId] = useState('');
    const [feedback, setFeedback] = useState<{ tone: FeedbackTone; message: string } | undefined>(undefined);
    const deferredSearchValue = useDeferredValue(searchValue.trim());
    const utils = trpc.useUtils();
    const prerequisitesQuery = trpc.provider.getCloudSessionPrerequisites.useQuery({
        profileId,
        providerId: 'kilo',
    });
    const cloudSessionsQuery = trpc.session.listCloudSessions.useQuery({
        profileId,
        scopeMode: 'current',
        ...(deferredSearchValue ? { query: deferredSearchValue } : {}),
    });
    const importMutation = trpc.session.importCloudSession.useMutation();
    const forkMutation = trpc.session.forkCloudSession.useMutation();
    const continueMutation = trpc.session.continueCloudSession.useMutation();
    const busy = importMutation.isPending || forkMutation.isPending || continueMutation.isPending;
    const prerequisites = prerequisitesQuery.data?.prerequisites;
    const blockers = prerequisites?.blockers ?? [];
    const canBrowse = prerequisites?.canBrowseRemoteSessions === true;
    const canContinue = prerequisites?.canContinueRemoteSessions === true;
    const blockerDiagnostics = buildCloudSessionPrerequisiteDiagnostics(blockers);

    async function refreshSessionSurfaces() {
        await Promise.all([
            utils.session.listCloudSessions.invalidate({ profileId }),
            utils.session.list.invalidate({ profileId }),
            utils.conversation.listThreads.invalidate(),
        ]);
    }

    async function handleActionResult(result: CloudSessionMutationResult) {
        if (!result.ok || !result.session) {
            setFeedback({ tone: 'error', message: result.message });
            return;
        }
        setFeedback({ tone: 'success', message: result.message });
        onCloudSessionCreated({
            session: result.session,
            ...(result.thread ? { thread: result.thread } : {}),
        });
        onSelectSession(result.session.id);
        await refreshSessionSurfaces();
    }

    return (
        <section className='space-y-4 text-sm'>
            <div className='border-border/70 bg-background/70 rounded-xl border p-3'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div>
                        <p className='font-semibold'>Kilo Cloud Sessions</p>
                        <p className='text-muted-foreground mt-1 text-xs'>
                            Browse local cloud-session records. Continued cloud runs execute in the Kilo-owned cloud
                            harness; remote workspace sync-back is not available in this alpha build.
                        </p>
                    </div>
                    <span className='border-border bg-card rounded-full border px-2.5 py-1 text-xs'>
                        {canBrowse ? 'Ready' : 'Blocked'}
                    </span>
                </div>
                {prerequisitesQuery.isLoading ? (
                    <p className='text-muted-foreground mt-3 text-xs'>Checking Kilo readiness...</p>
                ) : blockerDiagnostics.length > 0 ? (
                    <OperatorDiagnosticList diagnostics={blockerDiagnostics} className='mt-3' compact />
                ) : (
                    <p className='text-muted-foreground mt-3 text-xs'>
                        Scope {prerequisites?.scope?.remoteScopeKey ?? 'current Kilo account'}
                    </p>
                )}
            </div>

            <div className='grid gap-2'>
                <label className='space-y-1.5'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Search
                    </span>
                    <div className='relative'>
                        <Search className='text-muted-foreground pointer-events-none absolute top-2.5 left-3 h-4 w-4' />
                        <input
                            value={searchValue}
                            onChange={(event) => {
                                setSearchValue(event.target.value);
                            }}
                            className='border-border bg-background h-10 w-full rounded-xl border pr-3 pl-9 text-sm'
                            placeholder='Title, remote id, or scope'
                        />
                    </div>
                </label>

                <label className='space-y-1.5'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Import By Remote ID
                    </span>
                    <div className='flex gap-2'>
                        <input
                            value={importRemoteSessionId}
                            onChange={(event) => {
                                setImportRemoteSessionId(event.target.value);
                            }}
                            className='border-border bg-background h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm'
                            placeholder='Kilo session id'
                        />
                        <Button
                            type='button'
                            size='sm'
                            className='h-10 rounded-xl'
                            disabled={busy || !canBrowse || importRemoteSessionId.trim().length === 0}
                            onClick={() => {
                                void importMutation
                                    .mutateAsync({
                                        profileId,
                                        threadId,
                                        remoteSessionId: importRemoteSessionId.trim(),
                                    })
                                    .then(async (result) => {
                                        await handleActionResult(result);
                                        if (result.ok) {
                                            setImportRemoteSessionId('');
                                        }
                                    })
                                    .catch((error: unknown) => {
                                        setFeedback({
                                            tone: 'error',
                                            message: error instanceof Error ? error.message : 'Import failed.',
                                        });
                                    });
                            }}>
                            <Download className='mr-1.5 h-4 w-4' />
                            Import
                        </Button>
                    </div>
                </label>
            </div>

            {feedback ? (
                <p
                    className={
                        feedback.tone === 'error'
                            ? 'text-xs text-red-600 dark:text-red-300'
                            : feedback.tone === 'success'
                              ? 'text-xs text-emerald-700 dark:text-emerald-300'
                              : 'text-muted-foreground text-xs'
                    }>
                    {feedback.message}
                </p>
            ) : null}

            <div className='space-y-2'>
                {cloudSessionsQuery.isLoading ? (
                    <p className='text-muted-foreground text-xs'>Loading cloud-session records...</p>
                ) : (cloudSessionsQuery.data?.cloudSessions ?? []).length === 0 ? (
                    <p className='text-muted-foreground text-xs'>No cloud-session records match this scope.</p>
                ) : (
                    (cloudSessionsQuery.data?.cloudSessions ?? []).map((record) => (
                        <CloudSessionRecordRow
                            key={record.id}
                            record={record}
                            selected={record.localSessionId === selectedSessionId}
                            busy={busy}
                            canContinue={canContinue}
                            onSelectLocal={onSelectSession}
                            onFork={(cloudSession) => {
                                void forkMutation
                                    .mutateAsync({
                                        profileId,
                                        threadId,
                                        cloudSessionId: cloudSession.id,
                                    })
                                    .then(handleActionResult)
                                    .catch((error: unknown) => {
                                        setFeedback({
                                            tone: 'error',
                                            message: error instanceof Error ? error.message : 'Fork failed.',
                                        });
                                    });
                            }}
                            onContinue={(cloudSession) => {
                                void continueMutation
                                    .mutateAsync({
                                        profileId,
                                        threadId,
                                        cloudSessionId: cloudSession.id,
                                    })
                                    .then(handleActionResult)
                                    .catch((error: unknown) => {
                                        setFeedback({
                                            tone: 'error',
                                            message: error instanceof Error ? error.message : 'Continue failed.',
                                        });
                                    });
                            }}
                        />
                    ))
                )}
            </div>
        </section>
    );
}
