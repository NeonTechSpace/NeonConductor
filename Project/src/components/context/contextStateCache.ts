import { trpc } from '@/web/trpc/client';

type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type ResolvedContextStateData = Awaited<ReturnType<TrpcUtils['context']['getResolvedState']['fetch']>>;
type ResolvedContextStateInput = Parameters<TrpcUtils['context']['getResolvedState']['setData']>[0];

export function setResolvedContextStateCache(input: {
    utils: TrpcUtils;
    queryInput: ResolvedContextStateInput;
    state: ResolvedContextStateData;
}) {
    input.utils.context.getResolvedState.setData(input.queryInput, input.state);
}
