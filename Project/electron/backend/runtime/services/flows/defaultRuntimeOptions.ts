import type { RuntimeRunOptions } from '@/app/backend/runtime/contracts';

export const defaultFlowRuntimeOptions: RuntimeRunOptions = {
    reasoning: {
        effort: 'medium',
        summary: 'auto',
        includeEncrypted: true,
    },
    cache: {
        strategy: 'auto',
    },
    transport: {
        family: 'auto',
    },
};
