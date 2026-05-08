import { describe, expect, it } from 'vitest';

import { buildBrowserDesignQualityFindings } from '@/app/backend/runtime/services/devBrowser/designQualityDiagnostics';

import type {
    BrowserDesignerDraft,
    BrowserDesignerVariant,
    BrowserSelectionRecord,
    DevBrowserTarget,
} from '@/app/backend/runtime/contracts';

const now = '2026-05-08T10:00:00.000Z';

const allowedTarget: DevBrowserTarget = {
    scheme: 'http',
    host: 'localhost',
    port: 3000,
    path: '/',
    sourceKind: 'manual',
    browserAvailability: 'available',
    validation: {
        status: 'allowed',
        normalizedUrl: 'http://localhost:3000/',
        resolvedAddresses: ['127.0.0.1'],
    },
};

const riskySelection: BrowserSelectionRecord = {
    id: 'bsel_risky',
    pageIdentity: 'http://localhost:3000/',
    pageUrl: 'http://localhost:3000/',
    selector: {
        primary: 'button',
        path: ['html', 'body', 'button'],
    },
    ancestryTrail: [{ tagName: 'button', selector: 'button' }],
    accessibleRole: 'button',
    bounds: { x: 0, y: 0, width: 24, height: 20 },
    enrichmentMode: 'react_source_enriched',
    reactEnrichment: {
        sourceKind: 'provider',
        componentChain: [{ displayName: 'GeneratedButton' }],
        sourceAnchor: {
            status: 'workspace_relative',
            displayPath: 'dist/GeneratedButton.js',
            relativePath: 'dist/GeneratedButton.js',
            workspaceFingerprint: 'ws_alpha',
        },
    },
    stale: false,
    createdAt: now,
};

const riskyVariant: BrowserDesignerVariant = {
    id: 'bdvar_risky',
    designerSessionId: 'bdsess_risky',
    selectionId: riskySelection.id,
    pageIdentity: riskySelection.pageIdentity,
    name: 'Risky',
    summaryMarkdown: 'Adds risky styling.',
    rationaleMarkdown: 'Exercise diagnostics.',
    stylePatches: {
        color: '#777777',
        backgroundColor: '#777777',
        fontSize: '10px',
        letterSpacing: '-0.03em',
        opacity: '0.4',
        position: 'absolute',
    },
    textContentOverride: 'This replacement label is intentionally long for a tiny target',
    status: 'generated',
    createdAt: now,
    updatedAt: now,
};

const riskyDraft: BrowserDesignerDraft = {
    id: 'bdsn_risky',
    selectionId: riskySelection.id,
    sourceVariantId: riskyVariant.id,
    pageIdentity: riskySelection.pageIdentity,
    inclusionState: 'included',
    applyMode: 'apply_with_agent',
    applyStatus: 'blocked_generated_source_anchor',
    stylePatches: riskyVariant.stylePatches,
    textContentOverride: 'This replacement label is intentionally long for a tiny target',
    stale: false,
    createdAt: now,
    updatedAt: now,
};

describe('browser design quality diagnostics', () => {
    it('builds deterministic findings for source, accessibility, sizing, typography, color, layout, and apply guardrails', () => {
        const input = {
            target: allowedTarget,
            selections: [riskySelection],
            designerVariants: [riskyVariant],
            designerDrafts: [riskyDraft],
        };

        const first = buildBrowserDesignQualityFindings(input);
        const second = buildBrowserDesignQualityFindings(input);

        expect(second).toEqual(first);
        expect(first.map((finding) => finding.id).every((id) => id.startsWith('bddiag_'))).toBe(true);
        expect(first.map((finding) => finding.category)).toEqual(
            expect.arrayContaining([
                'source_anchor',
                'accessibility',
                'sizing',
                'typography',
                'color',
                'layout',
                'apply_guardrail',
            ])
        );
        expect(first.some((finding) => finding.severity === 'error' && finding.scope === 'draft')).toBe(true);
    });
});
