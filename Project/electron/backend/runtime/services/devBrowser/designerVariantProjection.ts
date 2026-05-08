import { messageStore, sessionDevBrowserDesignerStore } from '@/app/backend/persistence/stores';
import { parseBrowserDesignerVariant } from '@/app/backend/runtime/contracts/parsers/devBrowser';
import type { BrowserDesignerStylePatchSet, EntityId } from '@/shared/contracts';

function extractJsonObject(text: string): unknown {
    const trimmed = text.trim();
    const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
    const unfenced = fencedMatch?.[1] ?? trimmed;
    const firstBrace = unfenced.indexOf('{');
    const lastBrace = unfenced.lastIndexOf('}');
    const candidate = firstBrace >= 0 && lastBrace > firstBrace ? unfenced.slice(firstBrace, lastBrace + 1) : unfenced;
    return JSON.parse(candidate) as unknown;
}

async function readAssistantText(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
}): Promise<string> {
    const [messages, parts] = await Promise.all([
        messageStore.listMessagesBySession(input.profileId, input.sessionId, input.runId),
        messageStore.listPartsBySession(input.profileId, input.sessionId, input.runId),
    ]);
    const assistantMessageIds = new Set(
        messages.filter((message) => message.role === 'assistant').map((message) => message.id)
    );
    return parts
        .filter((part) => assistantMessageIds.has(part.messageId) && part.partType === 'text')
        .map((part) => (typeof part.payload['text'] === 'string' ? part.payload['text'] : ''))
        .join('\n')
        .trim();
}

function parseGeneratedVariants(input: {
    rawText: string;
    expectedCount: number;
    designerSessionId: EntityId<'bdsess'>;
    selectionId: EntityId<'bsel'>;
    pageIdentity: string;
}): Array<{
    name: string;
    summaryMarkdown: string;
    rationaleMarkdown: string;
    stylePatches: BrowserDesignerStylePatchSet;
    textContentOverride?: string;
}> {
    const parsed = extractJsonObject(input.rawText);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>)['variants'])) {
        throw new Error('Designer generation output must be JSON with a variants array.');
    }
    const variants = (parsed as { variants: unknown[] }).variants;
    if (variants.length !== input.expectedCount) {
        throw new Error(
            `Designer generation returned ${String(variants.length)} variants; expected ${String(input.expectedCount)}.`
        );
    }

    return variants.map((variant, index) => {
        const validated = parseBrowserDesignerVariant(
            {
                id: `bdvar_generated_${String(index)}`,
                designerSessionId: input.designerSessionId,
                selectionId: input.selectionId,
                pageIdentity: input.pageIdentity,
                ...(variant && typeof variant === 'object' ? (variant as Record<string, unknown>) : {}),
                status: 'generated',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
            },
            `variants[${String(index)}]`
        );
        return {
            name: validated.name,
            summaryMarkdown: validated.summaryMarkdown,
            rationaleMarkdown: validated.rationaleMarkdown,
            stylePatches: validated.stylePatches,
            ...(validated.textContentOverride ? { textContentOverride: validated.textContentOverride } : {}),
        };
    });
}

export async function projectBrowserDesignerGenerationRun(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    terminalStatus: 'completed' | 'failed' | 'aborted';
    errorMessage?: string;
}): Promise<void> {
    const designerSession = await (async () => {
        try {
            return await sessionDevBrowserDesignerStore.getSessionByGenerationRunId(input.runId);
        } catch (error) {
            if (error instanceof Error && /no such table: session_dev_browser_designer_sessions/.test(error.message)) {
                return undefined;
            }
            throw error;
        }
    })();
    if (!designerSession) {
        return;
    }
    if (input.terminalStatus !== 'completed') {
        await sessionDevBrowserDesignerStore.recordGenerationFailure({
            profileId: input.profileId,
            sessionId: input.sessionId,
            designerSessionId: designerSession.id,
            status: input.terminalStatus === 'aborted' ? 'aborted' : 'failed',
            errorMessage: input.errorMessage ?? `Designer generation ${input.terminalStatus}.`,
        });
        return;
    }

    try {
        const rawText = await readAssistantText(input);
        const variants = parseGeneratedVariants({
            rawText,
            expectedCount: designerSession.requestedVariantCount,
            designerSessionId: designerSession.id,
            selectionId: designerSession.selectionId,
            pageIdentity: designerSession.pageIdentity,
        });
        await sessionDevBrowserDesignerStore.replaceGeneratedVariants({
            profileId: input.profileId,
            sessionId: input.sessionId,
            designerSessionId: designerSession.id,
            variants,
        });
    } catch (error) {
        await sessionDevBrowserDesignerStore.recordGenerationFailure({
            profileId: input.profileId,
            sessionId: input.sessionId,
            designerSessionId: designerSession.id,
            errorMessage: error instanceof Error ? error.message : String(error),
        });
    }
}
