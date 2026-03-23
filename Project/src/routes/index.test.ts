import { describe, expect, it } from 'vitest';

import { Route } from '@/web/routes/index';

describe('index route', () => {
    it('redirects the root route to /sessions', () => {
        try {
            Route.options.beforeLoad?.({} as never);
            throw new Error('Expected the root route to redirect.');
        } catch (error) {
            const response = error as Response & {
                options?: {
                    to?: string;
                    statusCode?: number;
                };
            };

            expect(response.status).toBe(307);
            expect(response.options).toEqual({
                to: '/sessions',
                statusCode: 307,
            });
        }
    });
});
