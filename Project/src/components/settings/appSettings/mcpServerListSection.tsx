import type { McpServerRecord } from '@/shared/contracts/types/mcp';

export function McpServerListSection(input: {
    servers: McpServerRecord[];
    currentWorkspaceFingerprint?: string;
    isBusy: boolean;
    onEditServer: (server: McpServerRecord) => void;
    onConnectServer: (server: McpServerRecord) => Promise<void>;
    onDisconnectServer: (serverId: string) => Promise<void>;
    onRequestDelete: (server: McpServerRecord) => void;
}) {
    return (
        <section className='border-border/70 bg-card/40 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Servers</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Connected and ready servers expose MCP tools only in agent.code and agent.debug.
                </p>
            </div>

            <div className='space-y-3'>
                {input.servers.map((server) => {
                    const needsWorkspace = server.workingDirectoryMode === 'workspace_root';
                    const canConnect = !needsWorkspace || !!input.currentWorkspaceFingerprint;
                    return (
                        <article
                            key={server.id}
                            className='border-border/70 bg-background/70 space-y-3 rounded-2xl border p-4'>
                            <div className='space-y-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <p className='text-sm font-semibold'>{server.label}</p>
                                    <span className='border-border/80 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] tracking-[0.14em] uppercase'>
                                        {server.connectionState}
                                    </span>
                                    <span className='border-border/80 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] tracking-[0.14em] uppercase'>
                                        {server.toolDiscoveryState}
                                    </span>
                                </div>
                                <p className='text-muted-foreground text-xs break-all'>{server.command}</p>
                                {server.lastError ? (
                                    <p className='text-destructive text-xs'>{server.lastError}</p>
                                ) : null}
                                {needsWorkspace && !input.currentWorkspaceFingerprint ? (
                                    <p className='text-muted-foreground text-xs'>
                                        Select a workspace before connecting this server.
                                    </p>
                                ) : null}
                            </div>

                            {server.envKeys.length > 0 ? (
                                <div className='flex flex-wrap gap-2'>
                                    {server.envKeys.map((envKey) => (
                                        <span
                                            key={envKey}
                                            className='border-border/80 text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]'>
                                            {envKey}
                                        </span>
                                    ))}
                                </div>
                            ) : null}

                            {server.tools.length > 0 ? (
                                <div className='space-y-2'>
                                    {server.tools.map((tool) => (
                                        <div
                                            key={tool.name}
                                            className='border-border/70 bg-card/50 rounded-2xl border px-3 py-2'>
                                            <p className='text-xs font-medium'>{tool.name}</p>
                                            {tool.description ? (
                                                <p className='text-muted-foreground text-xs'>{tool.description}</p>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            <div className='flex flex-wrap gap-2'>
                                <button
                                    type='button'
                                    className='border-border/80 rounded-full border px-3 py-1.5 text-xs font-medium'
                                    onClick={() => {
                                        input.onEditServer(server);
                                    }}>
                                    Edit
                                </button>
                                <button
                                    type='button'
                                    className='border-border/80 rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-60'
                                    disabled={input.isBusy || !canConnect}
                                    onClick={() => {
                                        void input.onConnectServer(server);
                                    }}>
                                    Connect
                                </button>
                                <button
                                    type='button'
                                    className='border-border/80 rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-60'
                                    disabled={input.isBusy || server.connectionState === 'disconnected'}
                                    onClick={() => {
                                        void input.onDisconnectServer(server.id);
                                    }}>
                                    Disconnect
                                </button>
                                <button
                                    type='button'
                                    className='border-destructive/40 text-destructive rounded-full border px-3 py-1.5 text-xs font-medium'
                                    onClick={() => {
                                        input.onRequestDelete(server);
                                    }}>
                                    Delete
                                </button>
                            </div>
                        </article>
                    );
                })}

                {input.servers.length === 0 ? (
                    <div className='border-border/80 text-muted-foreground rounded-2xl border border-dashed px-4 py-6 text-sm'>
                        No MCP servers configured yet.
                    </div>
                ) : null}
            </div>
        </section>
    );
}
