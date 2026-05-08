import { createHash } from 'node:crypto';

import type {
    BrowserDesignQualityFinding,
    BrowserDesignQualityFindingCategory,
    BrowserDesignQualityFindingScope,
    BrowserDesignQualityFindingSeverity,
    BrowserDesignerDraft,
    BrowserDesignerStylePatchSet,
    BrowserDesignerVariant,
    BrowserSelectionRecord,
    DevBrowserTarget,
} from '@/app/backend/runtime/contracts';

import type { EntityId } from '@/shared/contracts';

type DiagnosticInput = {
    target?: DevBrowserTarget;
    selections: BrowserSelectionRecord[];
    designerDrafts: BrowserDesignerDraft[];
    designerVariants: BrowserDesignerVariant[];
};

type FindingDraft = Omit<BrowserDesignQualityFinding, 'id'> & {
    key: string;
};

const INTERACTIVE_ROLES = new Set([
    'button',
    'link',
    'checkbox',
    'combobox',
    'menuitem',
    'option',
    'radio',
    'searchbox',
    'switch',
    'tab',
    'textbox',
]);

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea']);

function stableDiagnosticId(input: FindingDraft): EntityId<'bddiag'> {
    const digest = createHash('sha256')
        .update(
            JSON.stringify({
                key: input.key,
                scope: input.scope,
                category: input.category,
                selectionId: input.selectionId ?? null,
                draftId: input.draftId ?? null,
                variantId: input.variantId ?? null,
            })
        )
        .digest('hex')
        .slice(0, 24);
    return `bddiag_${digest}`;
}

function materializeFinding(input: FindingDraft): BrowserDesignQualityFinding {
    const { key: _key, ...finding } = input;
    return {
        id: stableDiagnosticId(input),
        ...finding,
    };
}

function isInteractiveSelection(selection: BrowserSelectionRecord): boolean {
    if (selection.accessibleRole && INTERACTIVE_ROLES.has(selection.accessibleRole.toLowerCase())) {
        return true;
    }
    const tagName = selection.ancestryTrail[0]?.tagName.toLowerCase();
    return tagName ? INTERACTIVE_TAGS.has(tagName) : false;
}

function isGeneratedSourcePath(value: string | undefined): boolean {
    if (!value) {
        return false;
    }
    const normalized = value.replaceAll('\\', '/').toLowerCase();
    return /(^|\/)(node_modules|dist|build|out|coverage|target|\.next|\.nuxt|\.vite|generated|__generated__)(\/|$)/.test(
        normalized
    );
}

function parseCssNumber(value: string | undefined): number | undefined {
    if (!value) {
        return undefined;
    }
    const match = /^(-?\d+(?:\.\d+)?)/.exec(value.trim());
    const parsed = match?.[1];
    return parsed ? Number.parseFloat(parsed) : undefined;
}

function parseHexColor(value: string | undefined): [number, number, number] | undefined {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    const short = /^#([0-9a-f]{3})$/i.exec(trimmed);
    if (short) {
        const digits = short[1];
        if (!digits) {
            return undefined;
        }
        return [
            Number.parseInt(`${digits[0]}${digits[0]}`, 16),
            Number.parseInt(`${digits[1]}${digits[1]}`, 16),
            Number.parseInt(`${digits[2]}${digits[2]}`, 16),
        ];
    }
    const long = /^#([0-9a-f]{6})$/i.exec(trimmed);
    if (!long?.[1]) {
        return undefined;
    }
    return [
        Number.parseInt(long[1].slice(0, 2), 16),
        Number.parseInt(long[1].slice(2, 4), 16),
        Number.parseInt(long[1].slice(4, 6), 16),
    ];
}

function luminance([red, green, blue]: [number, number, number]): number {
    const [r, g, b] = [red, green, blue].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrastRatio(left: [number, number, number], right: [number, number, number]): number {
    const first = luminance(left);
    const second = luminance(right);
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
}

function createFinding(input: {
    key: string;
    scope: BrowserDesignQualityFindingScope;
    severity: BrowserDesignQualityFindingSeverity;
    category: BrowserDesignQualityFindingCategory;
    title: string;
    message: string;
    evidence?: string;
    selectionId?: EntityId<'bsel'>;
    variantId?: EntityId<'bdvar'>;
    draftId?: EntityId<'bdsn'>;
    stale?: boolean;
}): FindingDraft {
    return {
        key: input.key,
        scope: input.scope,
        severity: input.severity,
        category: input.category,
        title: input.title,
        message: input.message,
        ...(input.evidence ? { evidence: input.evidence } : {}),
        ...(input.selectionId ? { selectionId: input.selectionId } : {}),
        ...(input.variantId ? { variantId: input.variantId } : {}),
        ...(input.draftId ? { draftId: input.draftId } : {}),
        stale: input.stale === true,
    };
}

function collectSelectionFindings(selection: BrowserSelectionRecord): FindingDraft[] {
    const findings: FindingDraft[] = [];
    const sourceAnchor = selection.reactEnrichment?.sourceAnchor;
    if (selection.stale) {
        findings.push(
            createFinding({
                key: 'selection-stale',
                scope: 'selection',
                severity: 'error',
                category: 'stale_context',
                title: 'Selection is stale',
                message: 'The selected element belongs to an older page state and must be refreshed before apply.',
                selectionId: selection.id,
                stale: true,
            })
        );
    }
    if (!sourceAnchor || sourceAnchor.status === 'unresolved') {
        findings.push(
            createFinding({
                key: 'selection-source-missing',
                scope: 'selection',
                severity: 'warning',
                category: 'source_anchor',
                title: 'Source anchor missing',
                message: 'The selected element does not resolve to a safe source file yet.',
                selectionId: selection.id,
            })
        );
    } else if (sourceAnchor.status === 'outside_current_workspace') {
        findings.push(
            createFinding({
                key: 'selection-source-outside-workspace',
                scope: 'selection',
                severity: 'error',
                category: 'source_anchor',
                title: 'Source anchor outside workspace',
                message: 'The selected element resolves outside the current workspace.',
                evidence: sourceAnchor.displayPath,
                selectionId: selection.id,
            })
        );
    } else if (isGeneratedSourcePath(sourceAnchor.relativePath ?? sourceAnchor.displayPath)) {
        findings.push(
            createFinding({
                key: 'selection-source-generated',
                scope: 'selection',
                severity: 'error',
                category: 'source_anchor',
                title: 'Source anchor appears generated',
                message: 'The selected element resolves to a generated or build-output path, so source apply is blocked.',
                evidence: sourceAnchor.relativePath ?? sourceAnchor.displayPath,
                selectionId: selection.id,
            })
        );
    }

    if (isInteractiveSelection(selection)) {
        const hasName = Boolean(selection.accessibleLabel?.trim() || selection.textExcerpt?.trim());
        if (!hasName) {
            findings.push(
                createFinding({
                    key: 'interactive-name-missing',
                    scope: 'selection',
                    severity: 'warning',
                    category: 'accessibility',
                    title: 'Interactive element lacks a visible or accessible name',
                    message: 'Buttons and links should expose clear text or an accessible label.',
                    selectionId: selection.id,
                })
            );
        }
        if (selection.bounds.width < 32 || selection.bounds.height < 32) {
            findings.push(
                createFinding({
                    key: 'interactive-target-small',
                    scope: 'selection',
                    severity: 'warning',
                    category: 'sizing',
                    title: 'Interactive target is small',
                    message: 'The selected interactive element is below the first-pass 32px target-size threshold.',
                    evidence: `${String(selection.bounds.width)}x${String(selection.bounds.height)}`,
                    selectionId: selection.id,
                })
            );
        }
    }
    return findings;
}

function collectPatchFindings(input: {
    scope: 'variant' | 'draft';
    stylePatches: BrowserDesignerStylePatchSet;
    textContentOverride?: string;
    selection?: BrowserSelectionRecord;
    variantId?: EntityId<'bdvar'>;
    draftId?: EntityId<'bdsn'>;
}): FindingDraft[] {
    const findings: FindingDraft[] = [];
    const link = {
        ...(input.selection ? { selectionId: input.selection.id } : {}),
        ...(input.variantId ? { variantId: input.variantId } : {}),
        ...(input.draftId ? { draftId: input.draftId } : {}),
    };
    const letterSpacing = parseCssNumber(input.stylePatches.letterSpacing);
    if (letterSpacing !== undefined && letterSpacing < 0) {
        findings.push(
            createFinding({
                key: `${input.scope}-negative-letter-spacing`,
                scope: input.scope,
                severity: 'warning',
                category: 'typography',
                title: 'Negative letter spacing',
                message: 'Negative letter spacing can make UI text harder to scan.',
                ...(input.stylePatches.letterSpacing ? { evidence: input.stylePatches.letterSpacing } : {}),
                ...link,
            })
        );
    }
    const fontSize = parseCssNumber(input.stylePatches.fontSize);
    if (fontSize !== undefined && fontSize < 12) {
        findings.push(
            createFinding({
                key: `${input.scope}-small-font-size`,
                scope: input.scope,
                severity: 'warning',
                category: 'typography',
                title: 'Very small font size',
                message: 'The preview font size is below the first-pass 12px readability threshold.',
                ...(input.stylePatches.fontSize ? { evidence: input.stylePatches.fontSize } : {}),
                ...link,
            })
        );
    }
    const opacity = parseCssNumber(input.stylePatches.opacity);
    if (opacity !== undefined && opacity < 0.5) {
        findings.push(
            createFinding({
                key: `${input.scope}-low-opacity`,
                scope: input.scope,
                severity: 'warning',
                category: 'color',
                title: 'Low opacity',
                message: 'Low opacity can make content look disabled or hard to read.',
                ...(input.stylePatches.opacity ? { evidence: input.stylePatches.opacity } : {}),
                ...link,
            })
        );
    }
    if (input.stylePatches.position === 'fixed' || input.stylePatches.position === 'absolute') {
        findings.push(
            createFinding({
                key: `${input.scope}-positioning-risk`,
                scope: input.scope,
                severity: 'warning',
                category: 'layout',
                title: 'Positioning may be fragile',
                message: 'Fixed or absolute positioning can break responsive layout if not applied carefully.',
                evidence: input.stylePatches.position,
                ...link,
            })
        );
    }
    if (input.textContentOverride && input.selection && input.textContentOverride.length > 40 && input.selection.bounds.width < 180) {
        findings.push(
            createFinding({
                key: `${input.scope}-long-text-small-bounds`,
                scope: input.scope,
                severity: 'warning',
                category: 'sizing',
                title: 'Long text in narrow bounds',
                message: 'The text override may wrap or overflow inside the selected element bounds.',
                evidence: `${String(input.textContentOverride.length)} characters in ${String(input.selection.bounds.width)}px`,
                ...link,
            })
        );
    }
    const foreground = parseHexColor(input.stylePatches.color);
    const background = parseHexColor(input.stylePatches.backgroundColor);
    if (foreground && background) {
        const ratio = contrastRatio(foreground, background);
        if (ratio < 4.5) {
            findings.push(
                createFinding({
                    key: `${input.scope}-low-contrast`,
                    scope: input.scope,
                    severity: 'warning',
                    category: 'color',
                    title: 'Low text contrast',
                    message: 'The foreground/background colors are below the first-pass 4.5:1 contrast threshold.',
                    evidence: `${ratio.toFixed(2)}:1`,
                    ...link,
                })
            );
        }
    }
    return findings;
}

function collectDraftApplyFindings(draft: BrowserDesignerDraft, selection: BrowserSelectionRecord | undefined): FindingDraft[] {
    if (draft.applyMode !== 'apply_with_agent') {
        return [];
    }
    const findings: FindingDraft[] = [];
    const sourceAnchor = selection?.reactEnrichment?.sourceAnchor;
    if (draft.stale || selection?.stale) {
        findings.push(
            createFinding({
                key: 'draft-apply-stale',
                scope: 'draft',
                severity: 'error',
                category: 'apply_guardrail',
                title: 'Apply blocked by stale context',
                message: 'Refresh the browser selection before queueing an apply-through-agent run.',
                selectionId: draft.selectionId,
                draftId: draft.id,
                stale: true,
            })
        );
    }
    if (!sourceAnchor || sourceAnchor.status === 'unresolved') {
        findings.push(
            createFinding({
                key: 'draft-apply-source-missing',
                scope: 'draft',
                severity: 'error',
                category: 'apply_guardrail',
                title: 'Apply blocked by missing source anchor',
                message: 'Apply-through-agent requires a source-enriched selection inside the current workspace.',
                selectionId: draft.selectionId,
                draftId: draft.id,
            })
        );
    } else if (sourceAnchor.status === 'outside_current_workspace') {
        findings.push(
            createFinding({
                key: 'draft-apply-source-outside-workspace',
                scope: 'draft',
                severity: 'error',
                category: 'apply_guardrail',
                title: 'Apply blocked by outside-workspace source',
                message: 'Apply-through-agent cannot target source outside the current workspace.',
                evidence: sourceAnchor.displayPath,
                selectionId: draft.selectionId,
                draftId: draft.id,
            })
        );
    } else if (isGeneratedSourcePath(sourceAnchor.relativePath ?? sourceAnchor.displayPath)) {
        findings.push(
            createFinding({
                key: 'draft-apply-source-generated',
                scope: 'draft',
                severity: 'error',
                category: 'apply_guardrail',
                title: 'Apply blocked by generated source',
                message: 'Apply-through-agent is blocked for generated or build-output source anchors.',
                evidence: sourceAnchor.relativePath ?? sourceAnchor.displayPath,
                selectionId: draft.selectionId,
                draftId: draft.id,
            })
        );
    }
    return findings;
}

export function sourceAnchorLooksGenerated(selection: BrowserSelectionRecord): boolean {
    const sourceAnchor = selection.reactEnrichment?.sourceAnchor;
    return isGeneratedSourcePath(sourceAnchor?.relativePath ?? sourceAnchor?.displayPath);
}

export function buildBrowserDesignQualityFindings(input: DiagnosticInput): BrowserDesignQualityFinding[] {
    const selectionById = new Map(input.selections.map((selection) => [selection.id, selection]));
    const drafts = input.designerDrafts;
    const variants = input.designerVariants;
    const findings: FindingDraft[] = [];

    if (input.target && input.target.validation.status !== 'allowed') {
        findings.push(
            createFinding({
                key: 'page-target-blocked',
                scope: 'page',
                severity: 'error',
                category: 'apply_guardrail',
                title: 'Browser target is blocked',
                message: input.target.validation.blockedReasonMessage ?? 'The browser target is not allowed.',
                ...(input.target.validation.attemptedUrl || input.target.validation.normalizedUrl
                    ? { evidence: input.target.validation.attemptedUrl ?? input.target.validation.normalizedUrl }
                    : {}),
            })
        );
    }

    for (const selection of input.selections) {
        findings.push(...collectSelectionFindings(selection));
    }
    for (const variant of variants) {
        const selection = selectionById.get(variant.selectionId);
        findings.push(
            ...collectPatchFindings({
                scope: 'variant',
                stylePatches: variant.stylePatches,
                ...(variant.textContentOverride ? { textContentOverride: variant.textContentOverride } : {}),
                ...(selection ? { selection } : {}),
                variantId: variant.id,
            })
        );
    }
    for (const draft of drafts) {
        const selection = selectionById.get(draft.selectionId);
        findings.push(
            ...collectPatchFindings({
                scope: 'draft',
                stylePatches: draft.stylePatches,
                ...(draft.textContentOverride ? { textContentOverride: draft.textContentOverride } : {}),
                ...(selection ? { selection } : {}),
                draftId: draft.id,
            }),
            ...collectDraftApplyFindings(draft, selection)
        );
    }

    return findings.map(materializeFinding).sort((left, right) => left.id.localeCompare(right.id));
}
