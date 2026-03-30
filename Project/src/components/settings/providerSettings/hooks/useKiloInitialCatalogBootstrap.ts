import { useEffect, useRef } from 'react';

interface UseKiloInitialCatalogBootstrapInput {
    selectedProviderId: string | undefined;
    effectiveAuthState: string;
    modelOptionCount: number;
    isSyncingCatalog: boolean;
    syncCatalog: () => Promise<void>;
}

export interface KiloInitialCatalogBootstrapInput {
    selectedProviderId: string | undefined;
    effectiveAuthState: string;
    modelOptionCount: number;
    isSyncingCatalog: boolean;
    hasAttemptedBootstrap: boolean;
}

export function shouldAttemptKiloInitialCatalogBootstrap(input: KiloInitialCatalogBootstrapInput): boolean {
    return (
        input.selectedProviderId === 'kilo' &&
        input.effectiveAuthState === 'authenticated' &&
        input.modelOptionCount === 0 &&
        !input.isSyncingCatalog &&
        !input.hasAttemptedBootstrap
    );
}

export function shouldResetKiloInitialCatalogBootstrapAttempt(effectiveAuthState: string): boolean {
    return effectiveAuthState !== 'authenticated';
}

export function useKiloInitialCatalogBootstrap(input: UseKiloInitialCatalogBootstrapInput) {
    const attemptedInitialCatalogBootstrapRef = useRef(false);

    useEffect(() => {
        if (
            shouldAttemptKiloInitialCatalogBootstrap({
                selectedProviderId: input.selectedProviderId,
                effectiveAuthState: input.effectiveAuthState,
                modelOptionCount: input.modelOptionCount,
                isSyncingCatalog: input.isSyncingCatalog,
                hasAttemptedBootstrap: attemptedInitialCatalogBootstrapRef.current,
            })
        ) {
            attemptedInitialCatalogBootstrapRef.current = true;
            void input.syncCatalog();
            return;
        }

        if (shouldResetKiloInitialCatalogBootstrapAttempt(input.effectiveAuthState)) {
            attemptedInitialCatalogBootstrapRef.current = false;
        }
    }, [
        input.effectiveAuthState,
        input.isSyncingCatalog,
        input.modelOptionCount,
        input.selectedProviderId,
        input.syncCatalog,
    ]);
}
