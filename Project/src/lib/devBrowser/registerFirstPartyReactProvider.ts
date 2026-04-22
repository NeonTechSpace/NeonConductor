import {
    DEV_BROWSER_PAGE_BRIDGE_RESPONSE,
    isDevBrowserPageInspectRequest,
} from '@/app/shared/devBrowserPageBridge';

type ReactFiberNode = {
    return?: ReactFiberNode | null;
    type?: unknown;
    elementType?: unknown;
    _debugSource?: {
        fileName?: string;
        lineNumber?: number;
        columnNumber?: number;
    };
};

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

function resolveElementFromSelector(selector: { primary: string; path: string[] }): Element | null {
    try {
        const directMatch = document.querySelector(selector.primary);
        if (directMatch) {
            return directMatch;
        }
    } catch {
        // Fall through to path matching.
    }

    let current: Element | null = document.documentElement;
    for (const segment of selector.path) {
        if (!current) {
            return null;
        }
        const directChild: Element | undefined = Array.from(current.children).find(
            (candidate) => createSelectorSegment(candidate) === segment
        );
        current = directChild ?? null;
    }

    return current;
}

function readFiberFromElement(element: Element): ReactFiberNode | null {
    const candidateKeys = Object.getOwnPropertyNames(element).filter(
        (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
    );
    for (const key of candidateKeys) {
        const candidate = (element as unknown as Record<string, unknown>)[key];
        if (candidate && typeof candidate === 'object') {
            return candidate as ReactFiberNode;
        }
    }
    return null;
}

function readFiberDisplayName(value: unknown): string | undefined {
    if (!value) {
        return undefined;
    }
    if (typeof value === 'function') {
        const displayName = (value as { displayName?: string }).displayName ?? value.name;
        return displayName && displayName.trim().length > 0 ? displayName.trim() : undefined;
    }
    if (typeof value === 'object') {
        const candidate = value as Record<string, unknown>;
        if (typeof candidate['displayName'] === 'string' && candidate['displayName'].trim().length > 0) {
            return candidate['displayName'].trim();
        }
        if (typeof candidate['name'] === 'string' && candidate['name'].trim().length > 0) {
            return candidate['name'].trim();
        }
        if (candidate['render']) {
            return readFiberDisplayName(candidate['render']);
        }
        if (candidate['type']) {
            return readFiberDisplayName(candidate['type']);
        }
    }
    return undefined;
}

function readComponentChain(fiber: ReactFiberNode): Array<{ displayName: string }> {
    const componentChain: Array<{ displayName: string }> = [];
    let current: ReactFiberNode | null | undefined = fiber;
    while (current && componentChain.length < 12) {
        const displayName = readFiberDisplayName(current.type ?? current.elementType);
        if (displayName && !componentChain.some((candidate) => candidate.displayName === displayName)) {
            componentChain.push({ displayName });
        }
        current = current.return;
    }
    return componentChain;
}

function readSourceAnchor(fiber: ReactFiberNode): { absolutePath: string; displayPath?: string; line?: number; column?: number } | undefined {
    let current: ReactFiberNode | null | undefined = fiber;
    while (current) {
        const debugSource = current._debugSource;
        if (debugSource?.fileName && debugSource.fileName.trim().length > 0) {
            return {
                absolutePath: debugSource.fileName,
                displayPath: debugSource.fileName.split(/[\\/]/).slice(-2).join('/'),
                ...(debugSource.lineNumber ? { line: debugSource.lineNumber } : {}),
                ...(debugSource.columnNumber ? { column: debugSource.columnNumber } : {}),
            };
        }
        current = current.return;
    }
    return undefined;
}

export function registerFirstPartyReactProvider(): void {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
        return;
    }

    const marker = '__NEON_DEV_BROWSER_PROVIDER_INSTALLED__';
    const windowRecord = window as unknown as Record<string, unknown>;
    if (windowRecord[marker] === true) {
        return;
    }
    windowRecord[marker] = true;

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (event.source !== window || !isDevBrowserPageInspectRequest(event.data)) {
            return;
        }

        const element = resolveElementFromSelector(event.data.selector);
        const fiber = element ? readFiberFromElement(element) : null;
        const componentChain = fiber ? readComponentChain(fiber) : [];
        window.postMessage(
            {
                source: DEV_BROWSER_PAGE_BRIDGE_RESPONSE,
                requestId: event.data.requestId,
                found: componentChain.length > 0,
                ...(componentChain.length > 0 ? { componentChain } : {}),
                ...(fiber && readSourceAnchor(fiber) ? { sourceAnchor: readSourceAnchor(fiber) } : {}),
            },
            '*'
        );
    });
}
