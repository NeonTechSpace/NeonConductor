/// <reference lib="dom" />

import { ipcRenderer } from 'electron';

import { DEV_BROWSER_PICKER_CHANNEL, DEV_BROWSER_SELECTION_CHANNEL } from '@/app/shared/desktopBridgeContract';

type ElementSnapshot = {
    pageIdentity: string;
    pageUrl: string;
    pageTitle?: string;
    selector: {
        primary: string;
        path: string[];
    };
    ancestryTrail: Array<{
        tagName: string;
        selector: string;
        accessibleLabel?: string;
        accessibleRole?: string;
    }>;
    accessibleLabel?: string;
    accessibleRole?: string;
    textExcerpt?: string;
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
};

let pickerActive = false;
let highlightOverlay: HTMLDivElement | null = null;
let selectionOverlay: HTMLDivElement | null = null;
let highlightedElement: Element | null = null;
let dragStartPoint: { x: number; y: number } | null = null;
let dragCurrentPoint: { x: number; y: number } | null = null;
let dragTargetElement: Element | null = null;
let suppressNextClick = false;

const DRAG_SELECTION_THRESHOLD = 8;

function ensureOverlay(): HTMLDivElement {
    if (highlightOverlay && document.documentElement.contains(highlightOverlay)) {
        return highlightOverlay;
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '2147483646';
    overlay.style.border = '2px solid rgba(14, 165, 233, 0.95)';
    overlay.style.background = 'rgba(14, 165, 233, 0.12)';
    overlay.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.85) inset';
    overlay.style.display = 'none';
    document.documentElement.appendChild(overlay);
    highlightOverlay = overlay;
    return overlay;
}

function hideOverlay(): void {
    if (highlightOverlay) {
        highlightOverlay.style.display = 'none';
    }
}

function ensureSelectionOverlay(): HTMLDivElement {
    if (selectionOverlay && document.documentElement.contains(selectionOverlay)) {
        return selectionOverlay;
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '2147483647';
    overlay.style.border = '1px dashed rgba(14, 165, 233, 0.98)';
    overlay.style.background = 'rgba(14, 165, 233, 0.18)';
    overlay.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.65) inset';
    overlay.style.display = 'none';
    document.documentElement.appendChild(overlay);
    selectionOverlay = overlay;
    return overlay;
}

function hideSelectionOverlay(): void {
    if (selectionOverlay) {
        selectionOverlay.style.display = 'none';
    }
}

function createSelectorSegment(element: Element): string {
    if (element.id.trim().length > 0) {
        return `${element.tagName.toLowerCase()}#${CSS.escape(element.id)}`;
    }
    const parent = element.parentElement;
    const tagName = element.tagName.toLowerCase();
    if (!parent) {
        return tagName;
    }
    const siblings = Array.from(parent.children).filter((candidate) => candidate.tagName === element.tagName);
    const index = siblings.indexOf(element) + 1;
    return siblings.length > 1 ? `${tagName}:nth-of-type(${String(index)})` : tagName;
}

function buildSelectorPath(element: Element): string[] {
    const path: string[] = [];
    let current: Element | null = element;
    while (current && path.length < 8) {
        path.unshift(createSelectorSegment(current));
        current = current.parentElement;
    }
    return path;
}

function readAccessibleLabel(element: Element): string | undefined {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim().length > 0) {
        return ariaLabel.trim();
    }
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelElement = document.getElementById(labelledBy.trim());
        if (labelElement?.textContent?.trim()) {
            return labelElement.textContent.trim();
        }
    }
    const textContent = element.textContent?.trim();
    return textContent && textContent.length > 0 ? textContent.slice(0, 160) : undefined;
}

function buildElementSnapshot(element: Element): ElementSnapshot {
    const rect = element.getBoundingClientRect();
    const selectorPath = buildSelectorPath(element);
    const ancestryTrail: ElementSnapshot['ancestryTrail'] = [];
    let current: Element | null = element;
    while (current && ancestryTrail.length < 6) {
        const accessibleLabel = readAccessibleLabel(current);
        const accessibleRole = current.getAttribute('role') ?? undefined;
        ancestryTrail.push({
            tagName: current.tagName.toLowerCase(),
            selector: createSelectorSegment(current),
            ...(accessibleLabel ? { accessibleLabel } : {}),
            ...(accessibleRole ? { accessibleRole } : {}),
        });
        current = current.parentElement;
    }

    const accessibleLabel = readAccessibleLabel(element);
    const accessibleRole = element.getAttribute('role') ?? undefined;
    const textExcerpt = element.textContent?.trim()?.replace(/\s+/g, ' ').slice(0, 240);

    return {
        pageIdentity: `${window.location.origin}${window.location.pathname}${window.location.search}`,
        pageUrl: window.location.href,
        ...(document.title.trim().length > 0 ? { pageTitle: document.title.trim() } : {}),
        selector: {
            primary: selectorPath.join(' > '),
            path: selectorPath,
        },
        ancestryTrail,
        ...(accessibleLabel ? { accessibleLabel } : {}),
        ...(accessibleRole ? { accessibleRole } : {}),
        ...(textExcerpt ? { textExcerpt } : {}),
        bounds: {
            x: Math.max(0, Math.round(rect.x)),
            y: Math.max(0, Math.round(rect.y)),
            width: Math.max(1, Math.round(rect.width)),
            height: Math.max(1, Math.round(rect.height)),
        },
    };
}

function clampPointToViewport(input: { x: number; y: number }): { x: number; y: number } {
    return {
        x: Math.max(0, Math.min(window.innerWidth - 1, Math.round(input.x))),
        y: Math.max(0, Math.min(window.innerHeight - 1, Math.round(input.y))),
    };
}

function normalizeSelectionRect(
    start: { x: number; y: number },
    end: { x: number; y: number }
): ElementSnapshot['bounds'] {
    const clampedStart = clampPointToViewport(start);
    const clampedEnd = clampPointToViewport(end);
    const left = Math.min(clampedStart.x, clampedEnd.x);
    const top = Math.min(clampedStart.y, clampedEnd.y);
    const right = Math.max(clampedStart.x, clampedEnd.x);
    const bottom = Math.max(clampedStart.y, clampedEnd.y);
    return {
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
    };
}

function isDraggingAreaSelection(): boolean {
    if (!dragStartPoint || !dragCurrentPoint) {
        return false;
    }
    return (
        Math.abs(dragCurrentPoint.x - dragStartPoint.x) >= DRAG_SELECTION_THRESHOLD ||
        Math.abs(dragCurrentPoint.y - dragStartPoint.y) >= DRAG_SELECTION_THRESHOLD
    );
}

function updateSelectionOverlay(start: { x: number; y: number }, end: { x: number; y: number }): void {
    const overlay = ensureSelectionOverlay();
    const rect = normalizeSelectionRect(start, end);
    overlay.style.display = 'block';
    overlay.style.left = `${String(rect.x)}px`;
    overlay.style.top = `${String(rect.y)}px`;
    overlay.style.width = `${String(rect.width)}px`;
    overlay.style.height = `${String(rect.height)}px`;
}

function collectCandidateElements(rect: ElementSnapshot['bounds']): Element[] {
    const samplePoints = [
        { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        { x: rect.x + 1, y: rect.y + 1 },
        { x: rect.x + rect.width - 1, y: rect.y + 1 },
        { x: rect.x + 1, y: rect.y + rect.height - 1 },
        { x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 },
        { x: rect.x + rect.width / 2, y: rect.y + 1 },
        { x: rect.x + rect.width / 2, y: rect.y + rect.height - 1 },
        { x: rect.x + 1, y: rect.y + rect.height / 2 },
        { x: rect.x + rect.width - 1, y: rect.y + rect.height / 2 },
    ];
    const candidates = new Set<Element>();

    for (const point of samplePoints) {
        const clampedPoint = clampPointToViewport(point);
        const elementsAtPoint = document.elementsFromPoint(clampedPoint.x, clampedPoint.y);
        for (const element of elementsAtPoint) {
            candidates.add(element);
            let ancestor = element.parentElement;
            let depth = 0;
            while (ancestor && depth < 6) {
                candidates.add(ancestor);
                ancestor = ancestor.parentElement;
                depth += 1;
            }
        }
    }

    return Array.from(candidates).filter((candidate) => candidate !== document.documentElement && candidate !== document.body);
}

function computeIntersectionArea(
    selectionRect: ElementSnapshot['bounds'],
    elementRect: Pick<ElementSnapshot['bounds'], 'x' | 'y' | 'width' | 'height'>
): number {
    const selectionRight = selectionRect.x + selectionRect.width;
    const selectionBottom = selectionRect.y + selectionRect.height;
    const elementRight = elementRect.x + elementRect.width;
    const elementBottom = elementRect.y + elementRect.height;
    const overlapWidth = Math.max(0, Math.min(selectionRight, elementRight) - Math.max(selectionRect.x, elementRect.x));
    const overlapHeight = Math.max(0, Math.min(selectionBottom, elementBottom) - Math.max(selectionRect.y, elementRect.y));
    return overlapWidth * overlapHeight;
}

function selectElementForArea(start: { x: number; y: number }, end: { x: number; y: number }): Element | null {
    const selectionRect = normalizeSelectionRect(start, end);
    const candidates = collectCandidateElements(selectionRect);

    let smallestContainingCandidate: { element: Element; area: number } | null = null;
    for (const candidate of candidates) {
        const rect = candidate.getBoundingClientRect();
        const candidateBounds = {
            x: Math.max(0, rect.x),
            y: Math.max(0, rect.y),
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height),
        };
        const containsSelection =
            candidateBounds.x <= selectionRect.x &&
            candidateBounds.y <= selectionRect.y &&
            candidateBounds.x + candidateBounds.width >= selectionRect.x + selectionRect.width &&
            candidateBounds.y + candidateBounds.height >= selectionRect.y + selectionRect.height;
        if (!containsSelection) {
            continue;
        }
        const candidateArea = candidateBounds.width * candidateBounds.height;
        if (!smallestContainingCandidate || candidateArea < smallestContainingCandidate.area) {
            smallestContainingCandidate = {
                element: candidate,
                area: candidateArea,
            };
        }
    }
    if (smallestContainingCandidate) {
        return smallestContainingCandidate.element;
    }

    let bestIntersectingCandidate: { element: Element; intersectionArea: number; candidateArea: number } | null = null;
    for (const candidate of candidates) {
        const rect = candidate.getBoundingClientRect();
        const candidateBounds = {
            x: Math.max(0, rect.x),
            y: Math.max(0, rect.y),
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height),
        };
        const intersectionArea = computeIntersectionArea(selectionRect, candidateBounds);
        if (intersectionArea === 0) {
            continue;
        }
        const candidateArea = candidateBounds.width * candidateBounds.height;
        if (
            !bestIntersectingCandidate ||
            intersectionArea > bestIntersectingCandidate.intersectionArea ||
            (intersectionArea === bestIntersectingCandidate.intersectionArea &&
                candidateArea < bestIntersectingCandidate.candidateArea)
        ) {
            bestIntersectingCandidate = {
                element: candidate,
                intersectionArea,
                candidateArea,
            };
        }
    }

    return bestIntersectingCandidate?.element ?? null;
}

function clearDragState(): void {
    dragStartPoint = null;
    dragCurrentPoint = null;
    dragTargetElement = null;
    hideSelectionOverlay();
}

function updateHighlight(element: Element | null): void {
    highlightedElement = element;
    const overlay = ensureOverlay();
    if (!element) {
        overlay.style.display = 'none';
        return;
    }

    const rect = element.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = `${String(Math.round(rect.left))}px`;
    overlay.style.top = `${String(Math.round(rect.top))}px`;
    overlay.style.width = `${String(Math.max(1, Math.round(rect.width)))}px`;
    overlay.style.height = `${String(Math.max(1, Math.round(rect.height)))}px`;
}

function handleMouseMove(event: MouseEvent): void {
    if (!pickerActive) {
        return;
    }
    if (dragStartPoint) {
        dragCurrentPoint = {
            x: event.clientX,
            y: event.clientY,
        };
        if (isDraggingAreaSelection()) {
            hideOverlay();
            updateSelectionOverlay(dragStartPoint, dragCurrentPoint);
            return;
        }
    }
    updateHighlight(event.target instanceof Element ? event.target : null);
}

function handleMouseDown(event: MouseEvent): void {
    if (!pickerActive) {
        return;
    }
    dragStartPoint = {
        x: event.clientX,
        y: event.clientY,
    };
    dragCurrentPoint = dragStartPoint;
    dragTargetElement = event.target instanceof Element ? event.target : null;
    updateHighlight(dragTargetElement);
    hideSelectionOverlay();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}

function handleMouseUp(event: MouseEvent): void {
    if (!pickerActive) {
        return;
    }
    dragCurrentPoint = {
        x: event.clientX,
        y: event.clientY,
    };
    const target = dragStartPoint && dragCurrentPoint && isDraggingAreaSelection()
        ? selectElementForArea(dragStartPoint, dragCurrentPoint)
        : event.target instanceof Element
          ? event.target
          : highlightedElement ?? dragTargetElement;
    if (!target) {
        clearDragState();
        return;
    }

    suppressNextClick = true;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    clearDragState();
    updateHighlight(target);
    ipcRenderer.send(DEV_BROWSER_SELECTION_CHANNEL, buildElementSnapshot(target));
}

function handleClick(event: MouseEvent): void {
    if (!pickerActive && !suppressNextClick) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    suppressNextClick = false;
}

function setPickerActive(nextActive: boolean): void {
    pickerActive = nextActive;
    if (!pickerActive) {
        hideOverlay();
        clearDragState();
        return;
    }
    ensureOverlay();
    ensureSelectionOverlay();
}

window.addEventListener('mousedown', handleMouseDown, true);
window.addEventListener('mousemove', handleMouseMove, true);
window.addEventListener('mouseup', handleMouseUp, true);
window.addEventListener('click', handleClick, true);
window.addEventListener('blur', () => {
    if (pickerActive) {
        hideOverlay();
        hideSelectionOverlay();
    }
});

ipcRenderer.on(DEV_BROWSER_PICKER_CHANNEL, (_event, payload: unknown) => {
    const active = !!(payload && typeof payload === 'object' && (payload as Record<string, unknown>)['active'] === true);
    setPickerActive(active);
});
