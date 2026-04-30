export type WorkspacePrimarySurface = 'transcript' | 'browser';

const allWorkspacePrimarySurfaceTabs: WorkspacePrimarySurface[] = ['transcript', 'browser'];

export function getWorkspacePrimarySurfaceTabId(surface: WorkspacePrimarySurface): string {
    return `workspace-primary-${surface}-tab`;
}

export function getWorkspacePrimarySurfacePanelId(surface: WorkspacePrimarySurface): string {
    return `workspace-primary-${surface}-panel`;
}

export function moveWorkspacePrimarySurfaceTab(input: {
    currentSurface: WorkspacePrimarySurface;
    direction: 'next' | 'previous';
    browserEnabled: boolean;
}): WorkspacePrimarySurface {
    const availableTabs = input.browserEnabled
        ? allWorkspacePrimarySurfaceTabs
        : allWorkspacePrimarySurfaceTabs.slice(0, 1);
    const currentIndex = availableTabs.indexOf(input.currentSurface);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
        input.direction === 'next'
            ? (safeIndex + 1) % availableTabs.length
            : (safeIndex - 1 + availableTabs.length) % availableTabs.length;
    return availableTabs[nextIndex] ?? 'transcript';
}
