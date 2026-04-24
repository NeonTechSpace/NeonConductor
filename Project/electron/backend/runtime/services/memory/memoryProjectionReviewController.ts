import type {
    ApplyMemoryEditProposalInput,
    ApplyMemoryEditProposalResult,
    MemoryEditProposal,
    MemoryProjectionContextInput,
    MemoryScanProjectionEditsResult,
    ProjectedMemoryRecord,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    loadRelevantProjectionSnapshot,
} from '@/app/backend/runtime/services/memory/memoryProjectionCatalog';
import {
    buildCandidateProjectionForTarget,
} from '@/app/backend/runtime/services/memory/memoryProjectionContextResolver';
import { hashContent, parseMemoryProposal } from '@/app/backend/runtime/services/memory/memoryProjectionFileCodec';
import {
    scanProjectedMemory,
    writeProjectedMemoryFile,
} from '@/app/backend/runtime/services/memory/memoryProjectionWriter';
import { memoryService } from '@/app/backend/runtime/services/memory/service';

export class MemoryProjectionReviewController {
    async scanProjectionEdits(
        input: MemoryProjectionContextInput
    ): Promise<OperationalResult<MemoryScanProjectionEditsResult>> {
        const loaded = await loadRelevantProjectionSnapshot(input);
        if (loaded.isErr()) {
            return errOp(loaded.error.code, loaded.error.message, {
                ...(loaded.error.details ? { details: loaded.error.details } : {}),
            });
        }

        const proposals: MemoryEditProposal[] = [];
        const parseErrors: ProjectedMemoryRecord[] = [];

        for (const item of loaded.value.scanned) {
            if (item.projected.syncState === 'parse_error') {
                parseErrors.push(item.projected);
                continue;
            }
            if (item.projected.syncState !== 'edited' || !item.currentContent || !item.projected.fileUpdatedAt) {
                continue;
            }

            try {
                const parsedProposal = parseMemoryProposal(item.projected.memory, item.currentContent);
                proposals.push({
                    memory: item.projected.memory,
                    projectionTarget: item.projected.projectionTarget,
                    absolutePath: item.projected.absolutePath,
                    relativePath: item.projected.relativePath,
                    observedContentHash: item.projected.observedContentHash ?? hashContent(item.currentContent),
                    fileUpdatedAt: item.projected.fileUpdatedAt,
                    reviewAction:
                        parsedProposal.proposedState === 'disabled'
                            ? 'disable'
                            : parsedProposal.proposedState === 'superseded'
                              ? 'supersede'
                              : 'update',
                    proposedState: parsedProposal.proposedState,
                    proposedTitle: parsedProposal.title,
                    proposedCanonicalBody: parsedProposal.canonicalBody,
                    proposedBodyMarkdown: parsedProposal.bodyMarkdown,
                    ...(parsedProposal.summaryText ? { proposedSummaryText: parsedProposal.summaryText } : {}),
                    proposedMetadata: parsedProposal.metadata,
                });
            } catch (error) {
                parseErrors.push({
                    ...item.projected,
                    syncState: 'parse_error',
                    parseError: error instanceof Error ? error.message : 'Projected memory file could not be parsed.',
                });
            }
        }

        return okOp({
            paths: loaded.value.paths,
            proposals,
            parseErrors,
        });
    }

    async applyProjectionEditProposal(
        input: ApplyMemoryEditProposalInput
    ): Promise<OperationalResult<ApplyMemoryEditProposalResult>> {
        const scanned = await this.scanProjectionEdits(input);
        if (scanned.isErr()) {
            return errOp(scanned.error.code, scanned.error.message, {
                ...(scanned.error.details ? { details: scanned.error.details } : {}),
            });
        }

        const proposal = scanned.value.proposals.find((candidate) => candidate.memory.id === input.memoryId);
        if (!proposal) {
            return errOp('not_found', `Edited projection for memory "${input.memoryId}" was not found.`);
        }
        if (proposal.observedContentHash !== input.observedContentHash) {
            return errOp(
                'invalid_input',
                'Edited projection changed after it was reviewed. Scan again before applying.'
            );
        }

        if (input.decision === 'reject') {
            await writeProjectedMemoryFile(
                buildCandidateProjectionForTarget(proposal.memory, scanned.value.paths, proposal.projectionTarget)
            );
            const refreshed = await scanProjectedMemory(
                buildCandidateProjectionForTarget(proposal.memory, scanned.value.paths, proposal.projectionTarget)
            );
            return okOp({
                decision: 'reject',
                memory: proposal.memory,
                projection: refreshed.projected,
            });
        }

        if (proposal.reviewAction === 'update') {
            const updated = await memoryService.updateMemory({
                profileId: input.profileId,
                memoryId: input.memoryId,
                title: proposal.proposedTitle,
                canonicalBody: proposal.proposedCanonicalBody,
                bodyMarkdown: proposal.proposedBodyMarkdown,
                ...(proposal.proposedSummaryText ? { summaryText: proposal.proposedSummaryText } : {}),
                metadata: proposal.proposedMetadata,
            });
            if (updated.isErr()) {
                return errOp(updated.error.code, updated.error.message, {
                    ...(updated.error.details ? { details: updated.error.details } : {}),
                });
            }

            await writeProjectedMemoryFile(
                buildCandidateProjectionForTarget(updated.value, scanned.value.paths, proposal.projectionTarget)
            );
            const refreshed = await scanProjectedMemory(
                buildCandidateProjectionForTarget(updated.value, scanned.value.paths, proposal.projectionTarget)
            );
            return okOp({
                decision: 'accept',
                appliedAction: 'update',
                memory: updated.value,
                projection: refreshed.projected,
            });
        }

        if (proposal.reviewAction === 'disable') {
            const disabled = await memoryService.disableMemory({
                profileId: input.profileId,
                memoryId: input.memoryId,
            });
            if (disabled.isErr()) {
                return errOp(disabled.error.code, disabled.error.message, {
                    ...(disabled.error.details ? { details: disabled.error.details } : {}),
                });
            }

            await writeProjectedMemoryFile(
                buildCandidateProjectionForTarget(disabled.value, scanned.value.paths, proposal.projectionTarget)
            );
            const refreshed = await scanProjectedMemory(
                buildCandidateProjectionForTarget(disabled.value, scanned.value.paths, proposal.projectionTarget)
            );
            return okOp({
                decision: 'accept',
                appliedAction: 'disable',
                memory: disabled.value,
                projection: refreshed.projected,
            });
        }

        const superseded = await memoryService.supersedeMemory({
            profileId: input.profileId,
            memoryId: input.memoryId,
            createdByKind: 'user',
            title: proposal.proposedTitle,
            canonicalBody: proposal.proposedCanonicalBody,
            bodyMarkdown: proposal.proposedBodyMarkdown,
            ...(proposal.proposedSummaryText ? { summaryText: proposal.proposedSummaryText } : {}),
            metadata: proposal.proposedMetadata,
            revisionReason: 'correction',
        });
        if (superseded.isErr()) {
            return errOp(superseded.error.code, superseded.error.message, {
                ...(superseded.error.details ? { details: superseded.error.details } : {}),
            });
        }

        await Promise.all([
            writeProjectedMemoryFile(
                buildCandidateProjectionForTarget(
                    superseded.value.previous,
                    scanned.value.paths,
                    proposal.projectionTarget
                )
            ),
            writeProjectedMemoryFile(
                buildCandidateProjectionForTarget(
                    superseded.value.replacement,
                    scanned.value.paths,
                    proposal.projectionTarget
                )
            ),
        ]);
        const refreshed = await scanProjectedMemory(
            buildCandidateProjectionForTarget(superseded.value.replacement, scanned.value.paths, proposal.projectionTarget)
        );
        return okOp({
            decision: 'accept',
            appliedAction: 'supersede',
            memory: superseded.value.replacement,
            previousMemory: superseded.value.previous,
            projection: refreshed.projected,
        });
    }
}

export const memoryProjectionReviewController = new MemoryProjectionReviewController();
