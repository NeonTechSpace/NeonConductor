import { isDev } from '@/app/main/runtime/env';

export function isNeonObservabilityEnabled(): boolean {
    return process.env['NODE_ENV'] === 'test' || isDev;
}
