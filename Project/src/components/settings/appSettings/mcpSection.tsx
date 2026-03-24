import { useState } from 'react';

import { ConfirmDialog } from '@/web/components/ui/confirmDialog';
import { trpc } from '@/web/trpc/client';

type WorkingDirectoryMode = 'inherit_process' | 'workspace_root' | 'fixed_path';

interface EnvDraftEntry {
    id: string;
    key: string;
    value: string;
}

interface McpServerDraft {
    label: string;
    command: string;
    argsText: string;
    workingDirectoryMode: WorkingDirectoryMode;
    fixedWorkingDirectory: string;
    timeoutText: string;
    enabled: boolean;
    envEntries: EnvDraftEntry[];
}

function createId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyDraft(): McpServerDraft {
    return {
        label: '',
        command: '',
        argsText: '',
        workingDirectoryMode: 'inherit_process',
        fixedWorkingDirectory: '',
        timeoutText: '',
        enabled: true,
        envEntries: [],
    };
}

function parseArgs(argsText: string): string[] {
    return argsText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function parseTimeout(timeoutText: string): number | undefined {
    const trimmed = timeoutText.trim();
    if (trimmed.length === 0) {
        return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isDraftValid(draft: McpServerDraft): boolean {
    if (draft.label.trim().length === 0 || draft.command.trim().length === 0) {
        return false;
    }
    if (draft.workingDirectoryMode === 'fixed_path' && draft.fixedWorkingDirectory.trim().length === 0) {
        return false;
    }
    if (draft.timeoutText.trim().length > 0 && parseTimeout(draft.timeoutText) === undefined) {
        return false;
    }
    return true;
}

function createDraftFromServer(server: {
    label: string;
    command: string;
    args: string[];
    workingDirectoryMode: WorkingDirectoryMode;
    fixedWorkingDirectory?: string;
    timeoutMs?: number;
    enabled: boolean;
    envKeys: string[];
}): McpServerDraft {
    return {
        label: server.label,
        command: server.command,
        argsText: server.args.join('\n'),
        workingDirectoryMode: server.workingDirectoryMode,
        fixedWorkingDirectory: server.fixedWorkingDirectory ?? '',
        timeoutText: server.timeoutMs ? String(server.timeoutMs) : '',
        enabled: server.enabled,
        envEntries: server.envKeys.map((key) => ({
            id: createId(),
            key,
            value: '',
        })),
    };
}

export function McpSettingsSection(props: { profileId: string; currentWorkspaceFingerprint?: string }) {
    const utils = trpc.useUtils();
    const serversQuery = trpc.mcp.listServers.useQuery();
    const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
    const [editingServerId, setEditingServerId] = useState<string | undefined>(undefined);
    const [draft, setDraft] = useState<McpServerDraft>(() => createEmptyDraft());
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | undefined>(undefined);

    const selectedServer = editingServerId
        ? serversQuery.data?.servers.find((server) => server.id === editingServerId)
        : undefined;

    function startCreateServerDraft(options?: { preserveStatusMessage?: boolean }) {
        setEditorMode('create');
        setEditingServerId(undefined);
        setDraft(createEmptyDraft());
        if (!options?.preserveStatusMessage) {
            setStatusMessage(undefined);
        }
    }

    function startEditServerDraft(server: NonNullable<typeof selectedServer>) {
        setEditorMode('edit');
        setEditingServerId(server.id);
        setDraft(createDraftFromServer(server));
        setStatusMessage(undefined);
    }

    async function invalidateMcpQueries() {
        await Promise.all([utils.mcp.listServers.invalidate(), utils.mcp.getServer.invalidate()]);
    }

    const createServerMutation = trpc.mcp.createServer.useMutation();
    const updateServerMutation = trpc.mcp.updateServer.useMutation();
    const deleteServerMutation = trpc.mcp.deleteServer.useMutation({
        onSuccess: async () => {
            await invalidateMcpQueries();
        },
    });
    const connectMutation = trpc.mcp.connect.useMutation({
        onSuccess: async () => {
            await invalidateMcpQueries();
        },
    });
    const disconnectMutation = trpc.mcp.disconnect.useMutation({
        onSuccess: async () => {
            await invalidateMcpQueries();
        },
    });
    const setEnvSecretsMutation = trpc.mcp.setEnvSecrets.useMutation();

    const isBusy =
        createServerMutation.isPending ||
        updateServerMutation.isPending ||
        deleteServerMutation.isPending ||
        connectMutation.isPending ||
        disconnectMutation.isPending ||
        setEnvSecretsMutation.isPending;

    async function submitDraft() {
        const parsedTimeout = parseTimeout(draft.timeoutText);
        const payload = {
            label: draft.label.trim(),
            command: draft.command.trim(),
            args: parseArgs(draft.argsText),
            workingDirectoryMode: draft.workingDirectoryMode,
            ...(draft.workingDirectoryMode === 'fixed_path'
                ? { fixedWorkingDirectory: draft.fixedWorkingDirectory.trim() }
                : {}),
            ...(parsedTimeout !== undefined ? { timeoutMs: parsedTimeout } : {}),
            enabled: draft.enabled,
        } as const;
        const values = draft.envEntries
            .map((entry) => ({ key: entry.key.trim(), value: entry.value.trim() }))
            .filter((entry) => entry.key.length > 0 && entry.value.length > 0);

        if (editorMode === 'create') {
            const created = await createServerMutation.mutateAsync(payload);
            if (values.length > 0) {
                await setEnvSecretsMutation.mutateAsync({ serverId: created.server.id, values });
            }
            await invalidateMcpQueries();
            startCreateServerDraft({ preserveStatusMessage: true });
            setStatusMessage(`Created "${created.server.label}".`);
            return;
        }

        if (!selectedServer) {
            return;
        }

        const clearKeys = selectedServer.envKeys.filter(
            (existingKey) => !draft.envEntries.some((entry) => entry.key.trim() === existingKey)
        );
        const updated = await updateServerMutation.mutateAsync({ serverId: selectedServer.id, ...payload });
        if (!updated.updated) {
            setStatusMessage('Selected MCP server no longer exists.');
            return;
        }
        if (values.length > 0 || clearKeys.length > 0) {
            await setEnvSecretsMutation.mutateAsync({
                serverId: selectedServer.id,
                values,
                ...(clearKeys.length > 0 ? { clearKeys } : {}),
            });
        }
        await invalidateMcpQueries();
        setStatusMessage(`Updated "${updated.server.label}".`);
    }

    return (
        <section className='space-y-5'>
            <div className='grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]'>
                <section className='border-border/70 bg-card/40 space-y-4 rounded-[24px] border p-5'>
                    <div className='space-y-1'>
                        <p className='text-sm font-semibold'>Servers</p>
                        <p className='text-muted-foreground text-xs leading-5'>
                            Connected and ready servers expose MCP tools only in agent.code and agent.debug.
                        </p>
                    </div>

                    <div className='space-y-3'>
                        {(serversQuery.data?.servers ?? []).map((server) => {
                            const needsWorkspace = server.workingDirectoryMode === 'workspace_root';
                            const canConnect = !needsWorkspace || !!props.currentWorkspaceFingerprint;
                            return (
                                <article key={server.id} className='border-border/70 bg-background/70 space-y-3 rounded-2xl border p-4'>
                                    <div className='space-y-1'>
                                        <div className='flex flex-wrap items-center gap-2'>
                                            <p className='text-sm font-semibold'>{server.label}</p>
                                            <span className='rounded-full border border-border/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground'>
                                                {server.connectionState}
                                            </span>
                                            <span className='rounded-full border border-border/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground'>
                                                {server.toolDiscoveryState}
                                            </span>
                                        </div>
                                        <p className='text-muted-foreground text-xs break-all'>{server.command}</p>
                                        {server.lastError ? <p className='text-destructive text-xs'>{server.lastError}</p> : null}
                                        {needsWorkspace && !props.currentWorkspaceFingerprint ? (
                                            <p className='text-muted-foreground text-xs'>Select a workspace before connecting this server.</p>
                                        ) : null}
                                    </div>

                                    {server.envKeys.length > 0 ? (
                                        <div className='flex flex-wrap gap-2'>
                                            {server.envKeys.map((envKey) => (
                                                <span key={envKey} className='rounded-full border border-border/80 px-2 py-0.5 text-[11px] text-muted-foreground'>
                                                    {envKey}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}

                                    {server.tools.length > 0 ? (
                                        <div className='space-y-2'>
                                            {server.tools.map((tool) => (
                                                <div key={tool.name} className='rounded-2xl border border-border/70 bg-card/50 px-3 py-2'>
                                                    <p className='text-xs font-medium'>{tool.name}</p>
                                                    {tool.description ? <p className='text-muted-foreground text-xs'>{tool.description}</p> : null}
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}

                                    <div className='flex flex-wrap gap-2'>
                                        <button type='button' className='rounded-full border border-border/80 px-3 py-1.5 text-xs font-medium' onClick={() => {
                                            startEditServerDraft(server);
                                        }}>Edit</button>
                                        <button type='button' className='rounded-full border border-border/80 px-3 py-1.5 text-xs font-medium disabled:opacity-60' disabled={isBusy || !canConnect || !isDraftValid(createDraftFromServer(server))} onClick={() => {
                                            void connectMutation.mutateAsync({
                                                profileId: props.profileId,
                                                serverId: server.id,
                                                ...(props.currentWorkspaceFingerprint ? { workspaceFingerprint: props.currentWorkspaceFingerprint } : {}),
                                            });
                                        }}>Connect</button>
                                        <button type='button' className='rounded-full border border-border/80 px-3 py-1.5 text-xs font-medium disabled:opacity-60' disabled={isBusy || server.connectionState === 'disconnected'} onClick={() => {
                                            void disconnectMutation.mutateAsync({ serverId: server.id });
                                        }}>Disconnect</button>
                                        <button type='button' className='rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive' onClick={() => {
                                            setDeleteTarget({ id: server.id, label: server.label });
                                        }}>Delete</button>
                                    </div>
                                </article>
                            );
                        })}

                        {(serversQuery.data?.servers ?? []).length === 0 ? (
                            <div className='rounded-2xl border border-dashed border-border/80 px-4 py-6 text-sm text-muted-foreground'>
                                No MCP servers configured yet.
                            </div>
                        ) : null}
                    </div>
                </section>

                <section className='border-border/70 bg-card/40 space-y-4 rounded-[24px] border p-5'>
                    <div className='flex items-start justify-between gap-3'>
                        <div className='space-y-1'>
                            <p className='text-sm font-semibold'>{editorMode === 'create' ? 'Create server' : 'Edit server'}</p>
                            <p className='text-muted-foreground text-xs leading-5'>Env values are write-only after save.</p>
                        </div>
                        <button type='button' className='rounded-full border border-border/80 px-3 py-1.5 text-xs font-medium' onClick={() => {
                            startCreateServerDraft();
                        }}>New</button>
                    </div>

                    {statusMessage ? <p className='text-xs text-muted-foreground'>{statusMessage}</p> : null}

                    <div className='space-y-3'>
                        <input type='text' value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm' placeholder='Label' />
                        <input type='text' value={draft.command} onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))} className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm' placeholder='Command' />
                        <textarea value={draft.argsText} onChange={(event) => setDraft((current) => ({ ...current, argsText: event.target.value }))} className='border-border bg-background min-h-24 w-full rounded-md border px-2 py-2 text-sm' placeholder='One argument per line' />
                        <select value={draft.workingDirectoryMode} onChange={(event) => {
                            const nextMode = event.target.value as WorkingDirectoryMode;
                            setDraft((current) => ({ ...current, workingDirectoryMode: nextMode, fixedWorkingDirectory: nextMode === 'fixed_path' ? current.fixedWorkingDirectory : '' }));
                        }} className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'>
                            <option value='inherit_process'>Inherit process</option>
                            <option value='workspace_root'>Workspace root</option>
                            <option value='fixed_path'>Fixed path</option>
                        </select>
                        {draft.workingDirectoryMode === 'fixed_path' ? (
                            <input type='text' value={draft.fixedWorkingDirectory} onChange={(event) => setDraft((current) => ({ ...current, fixedWorkingDirectory: event.target.value }))} className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm' placeholder='Fixed working directory' />
                        ) : null}
                        <input type='number' value={draft.timeoutText} onChange={(event) => setDraft((current) => ({ ...current, timeoutText: event.target.value }))} className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm' placeholder='Timeout (ms)' />
                        <label className='flex items-center gap-2 text-sm'>
                            <input type='checkbox' checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />
                            Enabled
                        </label>

                        <div className='space-y-2'>
                            <div className='flex items-center justify-between gap-2'>
                                <p className='text-xs font-medium'>Env keys</p>
                                <button type='button' className='rounded-full border border-border/80 px-3 py-1 text-[11px] font-medium' onClick={() => {
                                    setDraft((current) => ({ ...current, envEntries: [...current.envEntries, { id: createId(), key: '', value: '' }] }));
                                }}>Add key</button>
                            </div>

                            {draft.envEntries.map((entry) => (
                                <div key={entry.id} className='grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'>
                                    <input type='text' value={entry.key} onChange={(event) => setDraft((current) => ({ ...current, envEntries: current.envEntries.map((candidate) => candidate.id === entry.id ? { ...candidate, key: event.target.value } : candidate) }))} className='border-border bg-background h-9 rounded-md border px-2 text-sm' placeholder='KEY' />
                                    <input type='password' value={entry.value} onChange={(event) => setDraft((current) => ({ ...current, envEntries: current.envEntries.map((candidate) => candidate.id === entry.id ? { ...candidate, value: event.target.value } : candidate) }))} className='border-border bg-background h-9 rounded-md border px-2 text-sm' placeholder='Value' />
                                    <button type='button' className='rounded-full border border-border/80 px-3 py-1 text-xs font-medium' onClick={() => {
                                        setDraft((current) => ({ ...current, envEntries: current.envEntries.filter((candidate) => candidate.id !== entry.id) }));
                                    }}>Remove</button>
                                </div>
                            ))}
                        </div>

                        <div className='flex justify-end'>
                            <button type='button' className='rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary disabled:opacity-60' disabled={isBusy || !isDraftValid(draft)} onClick={() => {
                                void submitDraft();
                            }}>{editorMode === 'create' ? 'Create server' : 'Save changes'}</button>
                        </div>
                    </div>
                </section>
            </div>

            <ConfirmDialog
                open={!!deleteTarget}
                title='Delete MCP Server'
                message={deleteTarget ? `Delete "${deleteTarget.label}"? This removes its config, discovered tools, and env secrets.` : ''}
                confirmLabel='Delete server'
                destructive
                busy={deleteServerMutation.isPending}
                onCancel={() => {
                    setDeleteTarget(undefined);
                }}
                onConfirm={() => {
                    if (!deleteTarget) {
                        return;
                    }

                    void deleteServerMutation.mutateAsync({ serverId: deleteTarget.id }).then(() => {
                        setDeleteTarget(undefined);
                        if (editingServerId === deleteTarget.id) {
                            startCreateServerDraft();
                        }
                    });
                }}
            />
        </section>
    );
}
