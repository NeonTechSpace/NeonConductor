import { applyBootStatus, normalizeBootStatusSnapshot } from '@/web/splash/model';

import {
    INITIAL_BOOT_STATUS_SNAPSHOT,
    type BootStatusSnapshot,
    type SplashBootstrapPayload,
} from '@/app/shared/splashContract';

import './styles.css';

function initializeSplash(): void {
    const bootstrapPayload: SplashBootstrapPayload = window.neonSplash?.getBootstrapPayload() ?? {
        mascotSource: null,
        status: INITIAL_BOOT_STATUS_SNAPSHOT,
    };
    const mascotImage = document.querySelector<HTMLImageElement>('[data-splash-mascot]');
    if (mascotImage && bootstrapPayload.mascotSource) {
        mascotImage.src = bootstrapPayload.mascotSource;
    }

    applyBootStatus(document, normalizeBootStatusSnapshot(bootstrapPayload.status));

    const removeStatusListener = window.neonSplash?.onStatusChange((status: BootStatusSnapshot) => {
        applyBootStatus(document, status);
    });

    window.addEventListener(
        'beforeunload',
        () => {
            removeStatusListener?.();
        },
        { once: true }
    );
}

initializeSplash();
