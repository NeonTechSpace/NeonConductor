import { isActiveUpdatePhase } from '@/web/components/window/updatesStatusQueryOptions';

interface UpdateSwitchStatusSnapshot {
    phase?: string;
}

export interface WindowCloseGuardState {
    canCloseImmediately: boolean;
    closeWarningTitle?: string;
    closeWarningMessage?: string;
}

export function getWindowCloseGuardState(updateStatus: UpdateSwitchStatusSnapshot | undefined): WindowCloseGuardState {
    if (!updateStatus || !isActiveUpdatePhase(updateStatus.phase)) {
        return {
            canCloseImmediately: true,
        };
    }

    if (updateStatus.phase === 'downloaded') {
        return {
            canCloseImmediately: false,
            closeWarningTitle: 'Update ready to install',
            closeWarningMessage:
                'A downloaded update is ready to install. Closing now will postpone installation until you reopen the app or install on quit.',
        };
    }

    return {
        canCloseImmediately: false,
        closeWarningTitle:
            updateStatus.phase === 'downloading' ? 'Update download in progress' : 'Update check in progress',
        closeWarningMessage:
            'NeonConductor is still working on an update. Closing now may interrupt that work and it may need to resume or restart later.',
    };
}
