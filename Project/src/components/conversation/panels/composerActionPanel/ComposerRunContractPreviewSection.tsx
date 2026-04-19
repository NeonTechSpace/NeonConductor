import type { RunContractPreview } from '@/shared/contracts';

interface ComposerRunContractPreviewSectionProps {
    preview?: RunContractPreview;
    isLoading: boolean;
    unavailableMessage?: string;
    waitingForAttachments?: boolean;
}

function renderTrustSummary(preview: RunContractPreview): string {
    const trustedInstructions = preview.trustSummary.contributorCountByTrustLevel.trusted_instruction;
    const userInputs = preview.trustSummary.contributorCountByTrustLevel.user_input;
    const workspaceContent = preview.trustSummary.contributorCountByTrustLevel.workspace_content;
    const promotedFacts = preview.trustSummary.contributorCountByTrustLevel.promoted_fact;
    return `${String(trustedInstructions)} trusted, ${String(userInputs)} user, ${String(workspaceContent)} workspace, ${String(promotedFacts)} promoted`;
}

export function ComposerRunContractPreviewSection(input: ComposerRunContractPreviewSectionProps) {
    return (
        <section className='border-border/60 bg-card/25 rounded-2xl border px-3 py-3'>
            <div className='mb-2 flex items-start justify-between gap-3'>
                <div>
                    <h3 className='text-sm font-semibold'>Run Contract Preview</h3>
                    <p className='text-muted-foreground text-xs'>
                        Current draft steering, prepared context, trust mix, and queue-compatibility signals.
                    </p>
                </div>
                <span className='text-muted-foreground rounded-full border px-2 py-1 text-[11px]'>
                    {input.isLoading
                        ? 'Refreshing'
                        : input.preview?.diffFromLastCompatible?.hasMaterialChanges
                          ? 'Changed'
                          : input.preview
                            ? 'Ready'
                            : 'Idle'}
                </span>
            </div>
            {input.waitingForAttachments ? (
                <p className='text-muted-foreground text-xs'>Run contract preview waits until attached files finish preparing.</p>
            ) : null}
            {!input.waitingForAttachments && input.unavailableMessage ? (
                <p className='text-muted-foreground text-xs'>{input.unavailableMessage}</p>
            ) : null}
            {!input.waitingForAttachments && !input.unavailableMessage && input.preview ? (
                <div className='grid gap-2 text-xs sm:grid-cols-2'>
                    <div className='rounded-xl border px-3 py-2'>
                        <p className='text-muted-foreground'>Target</p>
                        <p className='font-medium'>
                            {input.preview.steeringSnapshot.providerId} / {input.preview.steeringSnapshot.modelId}
                        </p>
                    </div>
                    <div className='rounded-xl border px-3 py-2'>
                        <p className='text-muted-foreground'>Cache</p>
                        <p className='font-medium'>{input.preview.cache.cacheabilityHint}</p>
                    </div>
                    <div className='rounded-xl border px-3 py-2'>
                        <p className='text-muted-foreground'>Prepared Context</p>
                        <p className='font-medium'>
                            {String(input.preview.preparedContext.activeContributorCount)} contributors
                        </p>
                    </div>
                    <div className='rounded-xl border px-3 py-2'>
                        <p className='text-muted-foreground'>Attachments</p>
                        <p className='font-medium'>
                            {String(input.preview.attachmentSummary.totalCount)} total
                            {input.preview.attachmentSummary.textFileAttachmentCount > 0
                                ? `, ${String(input.preview.attachmentSummary.textFileAttachmentCount)} text`
                                : ''}
                            {input.preview.attachmentSummary.imageAttachmentCount > 0
                                ? `, ${String(input.preview.attachmentSummary.imageAttachmentCount)} images`
                                : ''}
                        </p>
                    </div>
                    <div className='rounded-xl border px-3 py-2 sm:col-span-2'>
                        <p className='text-muted-foreground'>Trust Mix</p>
                        <p className='font-medium'>{renderTrustSummary(input.preview)}</p>
                    </div>
                    <div className='rounded-xl border px-3 py-2 sm:col-span-2'>
                        <p className='text-muted-foreground'>Dynamic Skill Expansion</p>
                        <p className='font-medium'>
                            {String(input.preview.dynamicExpansionSummary.resolvedCount)} resolved,{' '}
                            {String(input.preview.dynamicExpansionSummary.blockedCount)} blocked,{' '}
                            {String(input.preview.dynamicExpansionSummary.failedCount)} failed,{' '}
                            {String(input.preview.dynamicExpansionSummary.omittedCount)} omitted
                        </p>
                    </div>
                    {input.preview.diffFromLastCompatible ? (
                        <div className='rounded-xl border px-3 py-2 sm:col-span-2'>
                            <p className='text-muted-foreground'>Compatibility</p>
                            <p className='font-medium'>
                                {input.preview.diffFromLastCompatible.hasMaterialChanges
                                    ? 'Material drift detected before execution.'
                                    : 'Compatible with the last accepted contract.'}
                            </p>
                            {input.preview.diffFromLastCompatible.items.length > 0 ? (
                                <p className='text-muted-foreground mt-1'>
                                    {input.preview.diffFromLastCompatible.items
                                        .slice(0, 2)
                                        .map((item) => `${item.field}: ${item.reason}`)
                                        .join(' • ')}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
