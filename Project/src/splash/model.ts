import {
    formatBootElapsedMs,
    INITIAL_BOOT_STATUS_SNAPSHOT,
    getBootBlockingPrerequisiteLabel,
    isBootStatusSnapshot,
    type BootStatusSnapshot,
} from '@/app/shared/splashContract';

export interface SplashDocumentTarget {
    body: {
        dataset: Record<string, string | undefined>;
    };
    getElementById(id: string): { textContent: string | null } | null;
}

export function normalizeBootStatusSnapshot(value: unknown): BootStatusSnapshot {
    return isBootStatusSnapshot(value) ? value : INITIAL_BOOT_STATUS_SNAPSHOT;
}

function formatDiagnostics(status: BootStatusSnapshot): string {
    return `Elapsed: ${formatBootElapsedMs(status.elapsedMs)}`;
}

export function applyBootStatus(target: SplashDocumentTarget, status: BootStatusSnapshot): void {
    target.body.dataset['bootStage'] = status.stage;
    target.body.dataset['bootSource'] = status.source;
    target.body.dataset['bootStuck'] = status.isStuck ? 'true' : 'false';

    const headlineElement = target.getElementById('splash-headline');
    if (headlineElement) {
        headlineElement.textContent = status.headline;
    }

    const subtitleElement = target.getElementById('splash-subtitle');
    if (subtitleElement) {
        subtitleElement.textContent = status.detail;
    }

    const diagnosticsElement = target.getElementById('splash-diagnostics');
    if (!diagnosticsElement) {
        return;
    }

    const blockingPrerequisiteLabel = status.blockingPrerequisite
        ? getBootBlockingPrerequisiteLabel(status.blockingPrerequisite)
        : undefined;

    diagnosticsElement.textContent =
        !status.isStuck && blockingPrerequisiteLabel
            ? `Current blocker: ${blockingPrerequisiteLabel}`
            : formatDiagnostics(status);
}
