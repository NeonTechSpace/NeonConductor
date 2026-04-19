import { describe, expect, it } from 'vitest';

import {
    createDefaultPreparedContextModeOverrides,
    createDefaultPreparedContextProfileDefaults,
} from '@/app/backend/runtime/contracts';
import {
    buildPreparedContextDigestSummary,
    resolvePreparedContextLedger,
} from '@/app/backend/runtime/services/context/preparedContextLedger';

describe('preparedContextLedger', () => {
    it('applies profile defaults, mode overrides, and runtime-owned contributors from one resolution authority', async () => {
        const profileDefaults = createDefaultPreparedContextProfileDefaults();
        profileDefaults.app_global_instructions.bootstrap = 'exclude';
        profileDefaults.app_global_instructions.post_compaction_reseed = 'exclude';

        const modeOverrides = createDefaultPreparedContextModeOverrides();
        modeOverrides.app_global_instructions.bootstrap = 'include';

        const ledger = await resolvePreparedContextLedger({
            modelId: 'openai/gpt-5',
            contributorSpecs: [
                {
                    id: 'runtime_prelude',
                    kind: 'workspace_prelude',
                    group: 'runtime_environment',
                    label: 'Runtime prelude',
                    source: {
                        kind: 'workspace',
                        key: 'runtime_prelude',
                        label: 'Runtime prelude',
                    },
                    messages: [{ role: 'system', parts: [{ type: 'text', text: 'Runtime prelude' }] }],
                    fixedCheckpoint: 'bootstrap',
                },
                {
                    id: 'app_instructions',
                    kind: 'prompt_layer',
                    group: 'shared_prompt_layer',
                    label: 'App instructions',
                    source: {
                        kind: 'prompt_layer',
                        key: 'app_global_instructions',
                        label: 'App instructions',
                    },
                    messages: [{ role: 'system', parts: [{ type: 'text', text: 'App instructions' }] }],
                    eligiblePromptLayerGroup: 'app_global_instructions',
                },
            ],
            profileDefaults,
            modeOverrides,
            compactionReseedActive: false,
        });

        expect(ledger.bootstrapMessages).toHaveLength(2);
        expect(ledger.postCompactionReseedMessages).toEqual([]);
        expect(ledger.contributors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'runtime_prelude',
                    inclusionState: 'included',
                    injectionCheckpoint: 'bootstrap',
                }),
                expect.objectContaining({
                    id: 'app_instructions:bootstrap',
                    inclusionState: 'included',
                    inclusionReason: 'Included by the active mode override.',
                }),
                expect.objectContaining({
                    id: 'app_instructions:post_compaction_reseed',
                    inclusionState: 'excluded',
                    inclusionReason: 'Post-compaction reseed is inactive because no compaction summary is loaded.',
                }),
            ])
        );
        expect(ledger.checkpointSummaries.bootstrap.includedContributorCount).toBe(2);
        expect(ledger.checkpointSummaries.post_compaction_reseed.active).toBe(false);
    });

    it('tracks compaction-reseed checkpoint digests when reseed contributors are active', async () => {
        const ledger = await resolvePreparedContextLedger({
            modelId: 'openai/gpt-5',
            contributorSpecs: [
                {
                    id: 'profile_instructions',
                    kind: 'prompt_layer',
                    group: 'shared_prompt_layer',
                    label: 'Profile instructions',
                    source: {
                        kind: 'prompt_layer',
                        key: 'profile_global_instructions',
                        label: 'Profile instructions',
                    },
                    messages: [{ role: 'system', parts: [{ type: 'text', text: 'Profile instructions' }] }],
                    eligiblePromptLayerGroup: 'profile_global_instructions',
                },
                {
                    id: 'compaction_summary',
                    kind: 'compaction_summary',
                    group: 'compaction',
                    label: 'Compacted conversation summary',
                    source: {
                        kind: 'compaction',
                        key: 'session_compaction_summary',
                        label: 'Compacted conversation summary',
                    },
                    messages: [{ role: 'system', parts: [{ type: 'text', text: 'Compacted summary' }] }],
                    fixedCheckpoint: 'post_compaction_reseed',
                },
            ],
            profileDefaults: createDefaultPreparedContextProfileDefaults(),
            modeOverrides: createDefaultPreparedContextModeOverrides(),
            compactionReseedActive: true,
        });

        const digestSummary = buildPreparedContextDigestSummary({
            fullDigest: 'runctx-test',
            contributorDigest: ledger.contributorDigest,
            checkpointSummaries: ledger.checkpointSummaries,
            compactionReseedActive: ledger.compactionReseedActive,
        });

        expect(ledger.postCompactionReseedMessages).toHaveLength(2);
        expect(ledger.checkpointSummaries.post_compaction_reseed.active).toBe(true);
        expect(digestSummary.checkpoints.post_compaction_reseed.includedContributorCount).toBe(2);
        expect(digestSummary.cacheabilityHint).toContain('post-compaction reseed');
    });
});
