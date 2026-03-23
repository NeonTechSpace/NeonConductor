import { queryClient, trpcClient, trpcQueryUtils } from '@/web/lib/providers/trpcCore';
import type { AppRouterContext } from '@/web/routerContext';

export const routerContextValue: AppRouterContext = {
    queryClient,
    trpcClient,
    trpcUtils: trpcQueryUtils,
};
