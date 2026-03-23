/*
Why: Redirect the root hash entry to the Sessions route so the app has a real coarse destination.
*/

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
    beforeLoad: () => {
        throw redirect({
            to: '/sessions',
        });
    },
});
