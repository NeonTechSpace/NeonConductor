import { mcpStore } from '@/app/backend/persistence/stores';
import {
    mcpConnectInputSchema,
    mcpCreateServerInputSchema,
    mcpDeleteServerInputSchema,
    mcpDisconnectInputSchema,
    mcpGetServerInputSchema,
    mcpSetEnvSecretsInputSchema,
    mcpUpdateServerInputSchema,
} from '@/app/backend/runtime/contracts';
import { mcpService } from '@/app/backend/runtime/services/mcp/service';
import {
    runtimeRemoveEvent,
    runtimeStatusEvent,
    runtimeUpsertEvent,
} from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const mcpRouter = router({
    listServers: publicProcedure.query(async () => {
        return {
            servers: await mcpStore.listServers(),
        };
    }),
    getServer: publicProcedure.input(mcpGetServerInputSchema).query(async ({ input }) => {
        const server = await mcpStore.getServer(input.serverId);
        return server
            ? {
                  found: true as const,
                  server,
              }
            : {
                  found: false as const,
              };
    }),
    createServer: publicProcedure.input(mcpCreateServerInputSchema).mutation(async ({ input }) => {
        const server = await mcpStore.createServer(input);
        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'mcp',
                domain: 'mcp',
                entityId: server.id,
                eventType: 'mcp.server.created',
                payload: {
                    server,
                },
            })
        );
        return {
            server,
        };
    }),
    updateServer: publicProcedure.input(mcpUpdateServerInputSchema).mutation(async ({ input }) => {
        const server = await mcpStore.updateServer(input);
        if (!server) {
            return {
                updated: false as const,
                reason: 'not_found' as const,
            };
        }

        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'mcp',
                domain: 'mcp',
                entityId: server.id,
                eventType: 'mcp.server.updated',
                payload: {
                    server,
                },
            })
        );

        return {
            updated: true as const,
            server,
        };
    }),
    deleteServer: publicProcedure.input(mcpDeleteServerInputSchema).mutation(async ({ input }) => {
        const deleted = await mcpStore.deleteServer(input.serverId);
        if (deleted) {
            await runtimeEventLogService.append(
                runtimeRemoveEvent({
                    entityType: 'mcp',
                    domain: 'mcp',
                    entityId: input.serverId,
                    eventType: 'mcp.server.deleted',
                    payload: {
                        serverId: input.serverId,
                    },
                })
            );
        }

        return {
            deleted,
        };
    }),
    connect: publicProcedure.input(mcpConnectInputSchema).mutation(async ({ input }) => {
        const server = await mcpService.connect(input);
        if (!server) {
            return {
                connected: false as const,
                reason: 'not_found' as const,
            };
        }

        await runtimeEventLogService.append(
            runtimeStatusEvent({
                entityType: 'mcp',
                domain: 'mcp',
                entityId: server.id,
                eventType: 'mcp.server.connection.updated',
                payload: {
                    server,
                },
            })
        );

        return {
            connected: server.connectionState === 'connected',
            server,
        };
    }),
    disconnect: publicProcedure.input(mcpDisconnectInputSchema).mutation(async ({ input }) => {
        const server = await mcpService.disconnect(input.serverId);
        if (!server) {
            return {
                disconnected: false as const,
                reason: 'not_found' as const,
            };
        }

        await runtimeEventLogService.append(
            runtimeStatusEvent({
                entityType: 'mcp',
                domain: 'mcp',
                entityId: server.id,
                eventType: 'mcp.server.connection.updated',
                payload: {
                    server,
                },
            })
        );

        return {
            disconnected: true as const,
            server,
        };
    }),
    setEnvSecrets: publicProcedure.input(mcpSetEnvSecretsInputSchema).mutation(async ({ input }) => {
        const server = await mcpStore.setEnvSecrets(input);
        if (!server) {
            return {
                updated: false as const,
                reason: 'not_found' as const,
            };
        }

        await runtimeEventLogService.append(
            runtimeStatusEvent({
                entityType: 'mcp',
                domain: 'mcp',
                entityId: server.id,
                eventType: 'mcp.server.env.updated',
                payload: {
                    server,
                },
            })
        );

        return {
            updated: true as const,
            server,
        };
    }),
});
