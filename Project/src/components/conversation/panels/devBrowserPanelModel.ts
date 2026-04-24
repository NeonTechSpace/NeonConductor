import { skipToken } from '@tanstack/react-query';

import type { BrowserContextPacket, BrowserDesignerDraft, BrowserSelectionRecord, EntityId } from '@/shared/contracts';

export interface DevBrowserPanelProps {
    profileId: string;
    sessionId?: EntityId<'sess'>;
    visible: boolean;
    currentDraftPrompt: string;
    onSubmitPrompt: (prompt: string, browserContext?: BrowserContextPacket) => void;
    onQueuePrompt?: (prompt: string, browserContext?: BrowserContextPacket) => void;
}

export type DesignerDraftFormState = {
    applyMode: 'preview_only' | 'apply_with_agent';
    width: string;
    height: string;
    gap: string;
    padding: string;
    fontSize: string;
    color: string;
    backgroundColor: string;
    borderRadius: string;
    boxShadow: string;
    opacity: string;
    textContentOverride: string;
};

export const DESIGNER_STYLE_FIELDS: Array<{
    key: keyof Omit<DesignerDraftFormState, 'applyMode' | 'textContentOverride'>;
    label: string;
}> = [
    { key: 'width', label: 'Width' },
    { key: 'height', label: 'Height' },
    { key: 'gap', label: 'Gap' },
    { key: 'padding', label: 'Padding' },
    { key: 'fontSize', label: 'Font Size' },
    { key: 'color', label: 'Text Color' },
    { key: 'backgroundColor', label: 'Background' },
    { key: 'borderRadius', label: 'Radius' },
    { key: 'boxShadow', label: 'Shadow' },
    { key: 'opacity', label: 'Opacity' },
];

export function buildDesignerDraftFormState(draft?: BrowserDesignerDraft): DesignerDraftFormState {
    return {
        applyMode: draft?.applyMode ?? 'preview_only',
        width: draft?.stylePatches.width ?? '',
        height: draft?.stylePatches.height ?? '',
        gap: draft?.stylePatches.gap ?? '',
        padding: draft?.stylePatches.padding ?? '',
        fontSize: draft?.stylePatches.fontSize ?? '',
        color: draft?.stylePatches.color ?? '',
        backgroundColor: draft?.stylePatches.backgroundColor ?? '',
        borderRadius: draft?.stylePatches.borderRadius ?? '',
        boxShadow: draft?.stylePatches.boxShadow ?? '',
        opacity: draft?.stylePatches.opacity ?? '',
        textContentOverride: draft?.textContentOverride ?? '',
    };
}

export function toDesignerStylePatchPayload(formState: DesignerDraftFormState): {
    stylePatches: Record<string, string>;
    textContentOverride?: string;
} {
    const stylePatches: Record<string, string> = {};
    for (const field of DESIGNER_STYLE_FIELDS) {
        const value = formState[field.key].trim();
        if (value.length > 0) {
            stylePatches[field.key] = value;
        }
    }

    return {
        stylePatches,
        ...(formState.textContentOverride.trim().length > 0
            ? { textContentOverride: formState.textContentOverride.trim() }
            : {}),
    };
}

export function buildSessionScopedInput(profileId: string, sessionId: EntityId<'sess'> | undefined) {
    return sessionId
        ? {
              profileId,
              sessionId,
          }
        : skipToken;
}

export function summarizeSelection(selection: BrowserSelectionRecord): string {
    if (selection.accessibleLabel) {
        return selection.accessibleLabel;
    }
    if (selection.textExcerpt) {
        return selection.textExcerpt;
    }
    return selection.selector.primary;
}

export function describeValidationStatus(input: {
    status?: 'allowed' | 'blocked' | 'invalid';
    browserAvailability?: 'available' | 'unavailable';
}): string {
    if (input.browserAvailability === 'unavailable') {
        return 'Hidden';
    }
    if (input.status === 'allowed') {
        return 'Allowed';
    }
    if (input.status === 'blocked') {
        return 'Blocked';
    }
    if (input.status === 'invalid') {
        return 'Invalid';
    }
    return 'Idle';
}
