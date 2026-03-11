import { log } from 'evlog';
import { useEffect, useRef } from 'react';

import { trpcClient } from '@/web/lib/trpcClient';

import {
    getBootStatusDisplaySignature,
    getBootStatusSignature,
    type BootStatusSnapshot,
} from '@/app/shared/splashContract';

const isDev = import.meta.env.DEV;

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function useRendererBootStatusReporter(status: BootStatusSnapshot): void {
    const latestStatusRef = useRef(status);
    const latestLoggedStatusSignatureRef = useRef<string | null>(null);
    latestStatusRef.current = status;
    const statusSignature = getBootStatusSignature(status);
    const statusDisplaySignature = getBootStatusDisplaySignature(status);

    useEffect(() => {
        const nextStatus = latestStatusRef.current;

        if (isDev && latestLoggedStatusSignatureRef.current !== statusSignature) {
            latestLoggedStatusSignatureRef.current = statusSignature;
            log.info({
                tag: 'window.boot',
                message: 'Reporting renderer boot status.',
                stage: nextStatus.stage,
                blockingPrerequisite: nextStatus.blockingPrerequisite,
                isStuck: nextStatus.isStuck,
                elapsedMs: nextStatus.elapsedMs,
            });
        }

        void trpcClient.system.reportBootStatus.mutate(nextStatus).catch((error: unknown) => {
            if (!isDev) {
                return;
            }

            log.warn({
                tag: 'window.boot',
                message: 'Failed to report renderer boot status.',
                stage: nextStatus.stage,
                blockingPrerequisite: nextStatus.blockingPrerequisite,
                error: getErrorMessage(error),
            });
        });
    }, [statusDisplaySignature, statusSignature]);
}
