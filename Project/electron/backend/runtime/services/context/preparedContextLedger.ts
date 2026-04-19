import { createHash } from 'node:crypto';

import type {
    DynamicContextExpansion,
    PreparedContextCheckpointSummary,
    PreparedContextInstructionAuthority,
    PreparedContextTrustLevel,
    PreparedContextContributorGroup,
    PreparedContextContributorKind,
    PreparedContextContributorInclusionState,
    PreparedContextContributorSource,
    PreparedContextContributorSummary,
    PreparedContextDigestSummary,
} from '@/app/backend/runtime/contracts';
import type {
    PreparedContextEditablePromptLayerGroup,
    PreparedContextInjectionCheckpoint,
    PreparedContextModeOverrides,
    PreparedContextProfileDefaults,
} from '@/app/backend/runtime/contracts';
import { estimateMessageTokensLocally } from '@/app/backend/runtime/services/context/tokenCountingService';
import { hashablePartContent } from '@/app/backend/runtime/services/runExecution/contextParts';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

export interface PreparedContextContributorSpec {
    id: string;
    kind: PreparedContextContributorKind;
    group: PreparedContextContributorGroup;
    label: string;
    source: PreparedContextContributorSource;
    messages: RunContextMessage[];
    fixedCheckpoint?: PreparedContextInjectionCheckpoint;
    fixedInclusionState?: PreparedContextContributorInclusionState;
    eligiblePromptLayerGroup?: PreparedContextEditablePromptLayerGroup;
    inclusionReason?: string;
    dynamicExpansion?: DynamicContextExpansion;
}

export interface PreparedContextLedgerResolution {
    contributors: PreparedContextContributorSummary[];
    bootstrapMessages: RunContextMessage[];
    postCompactionReseedMessages: RunContextMessage[];
    checkpointSummaries: Record<PreparedContextInjectionCheckpoint, PreparedContextCheckpointSummary>;
    contributorDigest: string;
    compactionReseedActive: boolean;
}

function resolveContributorTrustLevel(kind: PreparedContextContributorKind): PreparedContextTrustLevel {
    switch (kind) {
        case 'retrieved_memory':
        case 'compaction_summary':
            return 'promoted_fact';
        case 'project_instruction':
        case 'dynamic_skill_context':
            return 'workspace_content';
        default:
            return 'trusted_instruction';
    }
}

function resolveContributorInstructionAuthority(
    kind: PreparedContextContributorKind
): PreparedContextInstructionAuthority {
    switch (kind) {
        case 'retrieved_memory':
        case 'compaction_summary':
            return 'retrieval_only';
        case 'dynamic_skill_context':
            return 'contextualize';
        default:
            return 'instruct';
    }
}

function digestMessages(prefix: string, messages: RunContextMessage[]): string {
    const hash = createHash('sha256');
    for (const message of messages) {
        hash.update(message.role);
        hash.update('|');
        for (const part of message.parts) {
            hash.update(hashablePartContent(part));
            hash.update('\n');
        }
    }
    return `${prefix}-${hash.digest('hex').slice(0, 32)}`;
}

function buildCheckpointSummary(input: {
    checkpoint: PreparedContextInjectionCheckpoint;
    contributors: PreparedContextContributorSummary[];
    active: boolean;
}): PreparedContextCheckpointSummary {
    const includedContributors = input.contributors.filter((contributor) => contributor.inclusionState === 'included');
    const estimatedTokenCount = includedContributors.reduce((sum, contributor) => sum + (contributor.tokenCount ?? 0), 0);

    return {
        checkpoint: input.checkpoint,
        includedContributorCount: includedContributors.length,
        excludedContributorCount: input.contributors.length - includedContributors.length,
        ...(estimatedTokenCount > 0 ? { estimatedTokenCount } : {}),
        digest: digestMessages(
            `ctxchk-${input.checkpoint}`,
            includedContributors.map((contributor) => ({
                role: 'system',
                parts: [{ type: 'text', text: contributor.digest }],
            }))
        ),
        active: input.active,
    };
}

function resolvePromptLayerReason(input: {
    checkpoint: PreparedContextInjectionCheckpoint;
    hasMessages: boolean;
    compactionReseedActive: boolean;
    profileDefault: PreparedContextProfileDefaults[PreparedContextEditablePromptLayerGroup][PreparedContextInjectionCheckpoint];
    modeOverride: PreparedContextModeOverrides[PreparedContextEditablePromptLayerGroup][PreparedContextInjectionCheckpoint];
}): { inclusionState: PreparedContextContributorSummary['inclusionState']; inclusionReason: string } {
    if (!input.hasMessages) {
        return {
            inclusionState: 'excluded',
            inclusionReason: 'No saved prompt text is configured for this layer.',
        };
    }

    if (input.checkpoint === 'post_compaction_reseed' && !input.compactionReseedActive) {
        return {
            inclusionState: 'excluded',
            inclusionReason: 'Post-compaction reseed is inactive because no compaction summary is loaded.',
        };
    }

    if (input.modeOverride === 'exclude') {
        return {
            inclusionState: 'excluded',
            inclusionReason: 'Excluded by the active mode override.',
        };
    }
    if (input.modeOverride === 'include') {
        return {
            inclusionState: 'included',
            inclusionReason: 'Included by the active mode override.',
        };
    }
    if (input.profileDefault === 'include') {
        return {
            inclusionState: 'included',
            inclusionReason: 'Included by the profile default.',
        };
    }
    return {
        inclusionState: 'excluded',
        inclusionReason: 'Excluded by the profile default.',
    };
}

export async function resolvePreparedContextLedger(input: {
    modelId: string;
    contributorSpecs: PreparedContextContributorSpec[];
    profileDefaults: PreparedContextProfileDefaults;
    modeOverrides: PreparedContextModeOverrides;
    compactionReseedActive: boolean;
}): Promise<PreparedContextLedgerResolution> {
    const contributors: PreparedContextContributorSummary[] = [];
    const bootstrapMessages: RunContextMessage[] = [];
    const postCompactionReseedMessages: RunContextMessage[] = [];
    let bootstrapOrder = 0;
    let postCompactionOrder = 0;

    for (const spec of input.contributorSpecs) {
        if (spec.eligiblePromptLayerGroup) {
            for (const checkpoint of ['bootstrap', 'post_compaction_reseed'] as const) {
                const resolution = resolvePromptLayerReason({
                    checkpoint,
                    hasMessages: spec.messages.length > 0,
                    compactionReseedActive: input.compactionReseedActive,
                    profileDefault: input.profileDefaults[spec.eligiblePromptLayerGroup][checkpoint],
                    modeOverride: input.modeOverrides[spec.eligiblePromptLayerGroup][checkpoint],
                });
                const includedMessages = resolution.inclusionState === 'included' ? spec.messages : [];
                const tokenCount =
                    includedMessages.length > 0
                        ? (
                              await Promise.all(
                                  includedMessages.map((message) =>
                                      estimateMessageTokensLocally({
                                          modelId: input.modelId,
                                          message,
                                      })
                                  )
                              )
                          ).reduce((sum, count) => sum + count, 0)
                        : undefined;
                const resolvedOrder = checkpoint === 'bootstrap' ? bootstrapOrder++ : postCompactionOrder++;
                if (resolution.inclusionState === 'included') {
                    if (checkpoint === 'bootstrap') {
                        bootstrapMessages.push(...spec.messages);
                    } else {
                        postCompactionReseedMessages.push(...spec.messages);
                    }
                }

                contributors.push({
                    id: `${spec.id}:${checkpoint}`,
                    kind: spec.kind,
                    group: spec.group,
                    label: spec.label,
                    source: spec.source,
                    inclusionState: resolution.inclusionState,
                    inclusionReason: resolution.inclusionReason,
                    injectionCheckpoint: checkpoint,
                    resolvedOrder,
                    countMode: tokenCount !== undefined ? 'estimated' : 'not_counted',
                    trustLevel: resolveContributorTrustLevel(spec.kind),
                    instructionAuthority: resolveContributorInstructionAuthority(spec.kind),
                    ...(tokenCount !== undefined ? { tokenCount } : {}),
                    digest: digestMessages(`ctxcontrib-${spec.id}-${checkpoint}`, spec.messages),
                });
            }
            continue;
        }

        const checkpoint = spec.fixedCheckpoint ?? 'bootstrap';
        const inclusionState = spec.fixedInclusionState ?? 'included';
        const tokenCount =
            inclusionState === 'included' && spec.messages.length > 0
                ? (
                      await Promise.all(
                          spec.messages.map((message) =>
                              estimateMessageTokensLocally({
                                  modelId: input.modelId,
                                  message,
                              })
                          )
                      )
                  ).reduce((sum, count) => sum + count, 0)
                : undefined;
        const resolvedOrder = checkpoint === 'bootstrap' ? bootstrapOrder++ : postCompactionOrder++;
        if (inclusionState === 'included') {
            if (checkpoint === 'bootstrap') {
                bootstrapMessages.push(...spec.messages);
            } else {
                postCompactionReseedMessages.push(...spec.messages);
            }
        }
        contributors.push({
            id: spec.id,
            kind: spec.kind,
            group: spec.group,
            label: spec.label,
            source: spec.source,
            inclusionState,
            inclusionReason: spec.inclusionReason ?? 'Included by runtime-owned prepared context resolution.',
            injectionCheckpoint: checkpoint,
            resolvedOrder,
            countMode: tokenCount !== undefined ? 'estimated' : 'not_counted',
            trustLevel: resolveContributorTrustLevel(spec.kind),
            instructionAuthority: resolveContributorInstructionAuthority(spec.kind),
            ...(tokenCount !== undefined ? { tokenCount } : {}),
            digest: digestMessages(`ctxcontrib-${spec.id}`, spec.messages),
            ...(spec.dynamicExpansion ? { dynamicExpansion: spec.dynamicExpansion } : {}),
        });
    }

    const checkpointSummaries: PreparedContextLedgerResolution['checkpointSummaries'] = {
        bootstrap: buildCheckpointSummary({
            checkpoint: 'bootstrap',
            contributors: contributors.filter((contributor) => contributor.injectionCheckpoint === 'bootstrap'),
            active: true,
        }),
        post_compaction_reseed: buildCheckpointSummary({
            checkpoint: 'post_compaction_reseed',
            contributors: contributors.filter((contributor) => contributor.injectionCheckpoint === 'post_compaction_reseed'),
            active: input.compactionReseedActive,
        }),
    };

    return {
        contributors,
        bootstrapMessages,
        postCompactionReseedMessages,
        checkpointSummaries,
        contributorDigest: digestMessages(
            'ctxcontributors',
            contributors
                .filter((contributor) => contributor.inclusionState === 'included')
                .map((contributor) => ({
                    role: 'system',
                    parts: [{ type: 'text', text: contributor.digest }],
                }))
        ),
        compactionReseedActive: input.compactionReseedActive,
    };
}

export function buildPreparedContextDigestSummary(input: {
    fullDigest: string;
    contributorDigest: string;
    checkpointSummaries: PreparedContextLedgerResolution['checkpointSummaries'];
    compactionReseedActive: boolean;
}): PreparedContextDigestSummary {
    return {
        fullDigest: input.fullDigest,
        contributorDigest: input.contributorDigest,
        cacheabilityHint: input.compactionReseedActive
            ? 'Prepared context is less stable while post-compaction reseed is active.'
            : 'Prepared context is stable until prompt layers, mode overrides, or system-owned contributors change.',
        checkpoints: input.checkpointSummaries,
    };
}
