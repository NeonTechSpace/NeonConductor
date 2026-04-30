export function moveWorkspaceCommandPaletteHighlight(input: {
    currentIndex: number;
    itemCount: number;
    direction: 'next' | 'previous';
}): number {
    if (input.itemCount <= 0) {
        return -1;
    }
    if (input.currentIndex < 0 || input.currentIndex >= input.itemCount) {
        return input.direction === 'next' ? 0 : input.itemCount - 1;
    }
    return input.direction === 'next'
        ? (input.currentIndex + 1) % input.itemCount
        : (input.currentIndex - 1 + input.itemCount) % input.itemCount;
}
