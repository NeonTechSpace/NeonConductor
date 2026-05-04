export function formatWorkbenchElapsedMs(elapsedMs: number): string {
    if (elapsedMs < 1000) {
        return `${String(elapsedMs)} ms`;
    }

    const seconds = elapsedMs / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${String(minutes)} min ${String(remainingSeconds)} s`;
}
