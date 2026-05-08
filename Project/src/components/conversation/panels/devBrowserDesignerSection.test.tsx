import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DevBrowserDesignerSection } from '@/web/components/conversation/panels/devBrowserDesignerSection';

import type {
    BrowserDesignQualityFinding,
    BrowserDesignerDraft,
    BrowserSelectionRecord,
} from '@/shared/contracts';

const now = '2026-05-08T10:00:00.000Z';

const selection: BrowserSelectionRecord = {
    id: 'bsel_apply',
    pageIdentity: 'http://localhost:3000/',
    pageUrl: 'http://localhost:3000/',
    selector: {
        primary: 'button',
        path: ['html', 'body', 'button'],
    },
    ancestryTrail: [{ tagName: 'button', selector: 'button', accessibleLabel: 'Start' }],
    accessibleRole: 'button',
    accessibleLabel: 'Start',
    textExcerpt: 'Start',
    bounds: { x: 10, y: 10, width: 120, height: 40 },
    enrichmentMode: 'react_source_enriched',
    reactEnrichment: {
        sourceKind: 'provider',
        componentChain: [{ displayName: 'CtaButton' }],
        sourceAnchor: {
            status: 'workspace_relative',
            displayPath: 'src/CtaButton.tsx',
            relativePath: 'src/CtaButton.tsx',
            workspaceFingerprint: 'ws_alpha',
        },
    },
    stale: false,
    createdAt: now,
};

const acceptedDraft: BrowserDesignerDraft = {
    id: 'bdsn_apply',
    selectionId: selection.id,
    sourceVariantId: 'bdvar_apply',
    pageIdentity: selection.pageIdentity,
    inclusionState: 'included',
    applyMode: 'apply_with_agent',
    applyStatus: 'eligible',
    stylePatches: {
        color: '#ffffff',
        backgroundColor: '#111111',
    },
    textContentOverride: 'Start now',
    stale: false,
    createdAt: now,
    updatedAt: now,
};

const blockingFinding: BrowserDesignQualityFinding = {
    id: 'bddiag_blocking',
    scope: 'draft',
    severity: 'error',
    category: 'apply_guardrail',
    title: 'Apply blocked by generated source',
    message: 'Apply-through-agent is blocked for generated or build-output source anchors.',
    evidence: 'dist/Button.js',
    selectionId: selection.id,
    draftId: acceptedDraft.id,
    stale: false,
};

function renderSection(diagnostics: BrowserDesignQualityFinding[]) {
    return renderToStaticMarkup(
        <DevBrowserDesignerSection
            selection={selection}
            designerDraft={acceptedDraft}
            annotations={[]}
            variants={[]}
            diagnostics={diagnostics}
            formState={{
                applyMode: 'apply_with_agent',
                width: '',
                height: '',
                gap: '',
                padding: '',
                fontSize: '',
                color: '#ffffff',
                backgroundColor: '#111111',
                borderRadius: '',
                boxShadow: '',
                opacity: '',
                textContentOverride: 'Start now',
            }}
            intentForm={{
                actionChip: 'polish',
                intentText: 'Make the CTA clearer.',
                requestedVariantCount: 3,
            }}
            annotationText=''
            generationBusy={false}
            applyQueueBusy={false}
            onFormChange={vi.fn()}
            onIntentFormChange={vi.fn()}
            onAnnotationTextChange={vi.fn()}
            onCreateLiveSession={vi.fn()}
            onCreateAnnotation={vi.fn()}
            onStartGeneration={vi.fn()}
            onActivateVariant={vi.fn()}
            onTuneVariant={vi.fn()}
            onAcceptVariant={vi.fn()}
            onDiscardVariant={vi.fn()}
            onQueueApplyIntent={vi.fn()}
            onPreview={vi.fn()}
            onDelete={vi.fn()}
            onToggleInclusion={vi.fn()}
        />
    );
}

describe('DevBrowserDesignerSection', () => {
    it('surfaces diagnostics and disables apply-through-agent when a blocking finding exists', () => {
        const html = renderSection([blockingFinding]);

        expect(html).toContain('Design diagnostics');
        expect(html).toContain('Apply blocked by generated source');
        expect(html).toContain('Apply-through-agent is blocked for generated or build-output source anchors.');
        expect(html).toContain('disabled=""');
    });

    it('keeps apply-through-agent enabled for an eligible accepted draft without blocking diagnostics', () => {
        const html = renderSection([]);

        expect(html).toContain('Apply Through Agent');
        expect(html).not.toContain('disabled=""');
    });
});
