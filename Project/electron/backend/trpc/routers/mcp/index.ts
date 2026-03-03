import { mcpStore } from '@/app/backend/persistence/stores';
import { mcpByServerInputSchema } from '@/app/backend/runtime/contracts';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const mcpRouter = router({
    listServers: publicProcedure.query(async () => {
        return { servers: await mcpStore.listServers() };
    }),
    connect: publicProcedure.input(mcpByServerInputSchema).mutation(async ({ input }) => {
        const server = await mcpStore.getServer(input.serverId);
        if (!server) {
            return { connected: false as const, reason: 'not_found' as const };
        }

        return {
            connected: false as const,
            reason: 'not_implemented' as const,
            server,
        };
    }),
    disconnect: publicProcedure.input(mcpByServerInputSchema).mutation(async ({ input }) => {
        const server = await mcpStore.getServer(input.serverId);
        if (!server) {
            return { disconnected: false as const, reason: 'not_found' as const };
        }

        return {
            disconnected: false as const,
            reason: 'not_implemented' as const,
            server,
        };
    }),
    authStatus: publicProcedure.input(mcpByServerInputSchema).query(async ({ input }) => {
        const server = await mcpStore.getServer(input.serverId);
        if (!server) {
            return { found: false as const };
        }

        return {
            found: true as const,
            serverId: server.id,
            authMode: server.authMode,
            authState: server.authState,
            connectionState: server.connectionState,
        };
    }),
});
