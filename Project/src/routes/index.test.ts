import { describe, expect, it } from 'vitest';

import { Route } from '@/web/routes/index';

describe('index route', () => {
    it('redirects the root route to /sessions', () => {
        let caughtResponse: Response & {
            options?: {
                to?: string;
                statusCode?: number;
            };
        };

        try {
            Route.options.beforeLoad?.({} as never);
            throw new Error('Expected the root route to redirect.');
        } catch (error) {
            caughtResponse = error as Response & {
                options?: {
                    to?: string;
                    statusCode?: number;
                };
            };
        }

        expect(caughtResponse.status).toBe(307);
        expect(caughtResponse.options).toEqual({
            to: '/sessions',
            statusCode: 307,
        });
    });
});
