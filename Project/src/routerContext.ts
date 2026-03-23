import type { queryClient, trpcClient, trpcQueryUtils } from '@/web/lib/providers/trpcCore';

export interface AppRouterContext {
    queryClient: typeof queryClient;
    trpcClient: typeof trpcClient;
    trpcUtils: typeof trpcQueryUtils;
}
