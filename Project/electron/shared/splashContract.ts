export const SPLASH_BOOT_STATUS_CHANNEL = 'neonconductor:splash-phase';

export const BOOT_STUCK_WARNING_MS = 4000;
export const BOOT_FORCE_SHOW_MS = 12000;

export const bootStages = [
    'main_initializing',
    'storage_ready',
    'persistence_ready',
    'secrets_ready',
    'windows_ready',
    'renderer_connecting',
    'profile_resolving',
    'mode_resolving',
    'shell_bootstrap_loading',
    'ready_to_show',
    'boot_stuck',
    'handoff_forced',
] as const;

export const bootBlockingPrerequisites = [
    'renderer_first_report',
    'resolved_profile',
    'initial_mode',
    'shell_bootstrap',
    'renderer_ready_signal',
] as const;

export const bootStatusSources = ['main', 'renderer'] as const;

export type BootStage = (typeof bootStages)[number];
export type BootBlockingPrerequisite = (typeof bootBlockingPrerequisites)[number];
export type BootStatusSource = (typeof bootStatusSources)[number];

export interface BootStatusSnapshot {
    stage: BootStage;
    headline: string;
    detail: string;
    isStuck: boolean;
    blockingPrerequisite: BootBlockingPrerequisite | null;
    elapsedMs: number;
    source: BootStatusSource;
}

export interface SplashBootstrapPayload {
    mascotSource: string | null;
    status: BootStatusSnapshot;
}

export const INITIAL_BOOT_STATUS_SNAPSHOT: BootStatusSnapshot = {
    stage: 'main_initializing',
    headline: 'Starting NeonConductor',
    detail: 'Initializing the desktop runtime.',
    isStuck: false,
    blockingPrerequisite: null,
    elapsedMs: 0,
    source: 'main',
};

function isAllowedString<const T extends readonly string[]>(value: string, allowedValues: T): value is T[number] {
    return allowedValues.some((allowedValue) => allowedValue === value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isBootStage(value: unknown): value is BootStage {
    return typeof value === 'string' && isAllowedString(value, bootStages);
}

export function isBootBlockingPrerequisite(value: unknown): value is BootBlockingPrerequisite {
    return typeof value === 'string' && isAllowedString(value, bootBlockingPrerequisites);
}

export function isBootStatusSource(value: unknown): value is BootStatusSource {
    return typeof value === 'string' && isAllowedString(value, bootStatusSources);
}

export function isBootStatusSnapshot(value: unknown): value is BootStatusSnapshot {
    if (!isObjectRecord(value)) {
        return false;
    }

    const blockingPrerequisite = value['blockingPrerequisite'];
    return (
        isBootStage(value['stage']) &&
        typeof value['headline'] === 'string' &&
        value['headline'].trim().length > 0 &&
        typeof value['detail'] === 'string' &&
        value['detail'].trim().length > 0 &&
        typeof value['isStuck'] === 'boolean' &&
        (blockingPrerequisite === null || isBootBlockingPrerequisite(blockingPrerequisite)) &&
        typeof value['elapsedMs'] === 'number' &&
        Number.isFinite(value['elapsedMs']) &&
        isBootStatusSource(value['source'])
    );
}

export function getBootBlockingPrerequisiteLabel(prerequisite: BootBlockingPrerequisite): string {
    switch (prerequisite) {
        case 'renderer_first_report':
            return 'renderer boot report';
        case 'resolved_profile':
            return 'active profile resolution';
        case 'initial_mode':
            return 'initial mode resolution';
        case 'shell_bootstrap':
            return 'shell bootstrap data';
        case 'renderer_ready_signal':
            return 'renderer ready handoff';
    }
}

function getBootStageHeadline(stage: BootStage, isStuck: boolean): string {
    if (stage === 'boot_stuck') {
        return 'Startup is taking longer than expected';
    }
    if (stage === 'handoff_forced') {
        return 'Opening the app despite stalled startup';
    }
    if (stage === 'ready_to_show' && isStuck) {
        return 'Renderer finished booting but handoff is stuck';
    }

    switch (stage) {
        case 'main_initializing':
            return 'Starting NeonConductor';
        case 'storage_ready':
            return 'Resolving runtime storage';
        case 'persistence_ready':
            return 'Opening persistence';
        case 'secrets_ready':
            return 'Preparing provider secrets';
        case 'windows_ready':
            return 'Creating application windows';
        case 'renderer_connecting':
            return 'Connecting the renderer';
        case 'profile_resolving':
            return 'Resolving the active profile';
        case 'mode_resolving':
            return 'Resolving the initial mode';
        case 'shell_bootstrap_loading':
            return 'Loading shell bootstrap data';
        case 'ready_to_show':
            return 'Finalizing the main window handoff';
    }
}

function getDefaultBootDetail(
    stage: BootStage,
    blockingPrerequisite: BootBlockingPrerequisite | null,
    isStuck: boolean
): string {
    if (stage === 'boot_stuck') {
        return blockingPrerequisite
            ? `Waiting on: ${getBootBlockingPrerequisiteLabel(blockingPrerequisite)}.`
            : 'Waiting on a startup prerequisite.';
    }

    if (stage === 'handoff_forced') {
        return blockingPrerequisite
            ? `Forced the main window open while waiting on: ${getBootBlockingPrerequisiteLabel(blockingPrerequisite)}.`
            : 'Forced the main window open while startup was still incomplete.';
    }

    if (stage === 'ready_to_show' && isStuck && blockingPrerequisite === 'renderer_ready_signal') {
        return 'Renderer boot finished, but the final handoff signal has not completed.';
    }

    switch (stage) {
        case 'main_initializing':
            return 'Initializing the desktop runtime.';
        case 'storage_ready':
            return 'Runtime storage paths are ready.';
        case 'persistence_ready':
            return 'Persistence opened successfully.';
        case 'secrets_ready':
            return 'Provider secret storage is ready.';
        case 'windows_ready':
            return 'Splash and main windows are prepared.';
        case 'renderer_connecting':
            return 'Waiting for the renderer to report boot progress.';
        case 'profile_resolving':
            return 'Resolving the active workspace profile.';
        case 'mode_resolving':
            return 'Resolving the initial workspace mode.';
        case 'shell_bootstrap_loading':
            return 'Loading shell bootstrap data for the active profile.';
        case 'ready_to_show':
            return 'Renderer boot is complete. Handing off to the main window.';
    }
}

export function createBootStatusSnapshot(input: {
    stage: BootStage;
    source: BootStatusSource;
    elapsedMs: number;
    isStuck?: boolean;
    blockingPrerequisite?: BootBlockingPrerequisite | null;
    headline?: string;
    detail?: string;
}): BootStatusSnapshot {
    const blockingPrerequisite = input.blockingPrerequisite ?? null;
    const isStuck = input.isStuck ?? false;

    return {
        stage: input.stage,
        source: input.source,
        elapsedMs: input.elapsedMs,
        isStuck,
        blockingPrerequisite,
        headline: input.headline ?? getBootStageHeadline(input.stage, isStuck),
        detail: input.detail ?? getDefaultBootDetail(input.stage, blockingPrerequisite, isStuck),
    };
}

export function formatBootElapsedMs(elapsedMs: number): string {
    return `${Math.max(0, Math.round(elapsedMs / 100) / 10).toFixed(1)}s`;
}

export function getBootStatusSignature(
    input: Pick<BootStatusSnapshot, 'stage' | 'headline' | 'detail' | 'isStuck' | 'blockingPrerequisite' | 'source'>
): string {
    return [
        input.stage,
        input.headline,
        input.detail,
        input.isStuck ? 'stuck' : 'progressing',
        input.blockingPrerequisite ?? 'none',
        input.source,
    ].join('|');
}

export function getBootStatusDisplaySignature(
    input: Pick<
        BootStatusSnapshot,
        'stage' | 'headline' | 'detail' | 'isStuck' | 'blockingPrerequisite' | 'source' | 'elapsedMs'
    >
): string {
    return `${getBootStatusSignature(input)}|${formatBootElapsedMs(input.elapsedMs)}`;
}
