import { beforeEach, describe, expect, it } from 'vitest';

import { neonObservabilityService } from '@/app/backend/runtime/services/observability/service';

describe('neonObservabilityService', () => {
    beforeEach(() => {
        neonObservabilityService.resetForTests();
    });

    it('buffers events in sequence order and replays them through filtered reads', () => {
        neonObservabilityService.publish({
            kind: 'run_started',
            profileId: 'profile_default',
            sessionId: 'sess_alpha',
            runId: 'run_alpha',
            providerId: 'openai',
            modelId: 'gpt-test',
            source: 'runtime.run_execution',
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        neonObservabilityService.publish({
            kind: 'run_completed',
            profileId: 'profile_default',
            sessionId: 'sess_beta',
            runId: 'run_beta',
            providerId: 'openai',
            modelId: 'gpt-test',
            source: 'runtime.run_execution',
        });

        expect(neonObservabilityService.list({}, 10).map((event) => event.sequence)).toEqual([1, 2]);
        expect(
            neonObservabilityService.list(
                {
                    profileId: 'profile_default',
                    sessionId: 'sess_beta',
                },
                10
            )
        ).toHaveLength(1);
        expect(
            neonObservabilityService.list(
                {
                    afterSequence: 1,
                },
                10
            ).map((event) => event.runId)
        ).toEqual(['run_beta']);
    });

    it('notifies subscribed listeners only for matching filters', () => {
        const seenRunIds: string[] = [];
        const unsubscribe = neonObservabilityService.subscribe(
            (event) => {
                seenRunIds.push(event.runId);
            },
            {
                runId: 'run_target',
            }
        );

        neonObservabilityService.publish({
            kind: 'run_started',
            profileId: 'profile_default',
            sessionId: 'sess_other',
            runId: 'run_other',
            providerId: 'openai',
            modelId: 'gpt-test',
            source: 'runtime.run_execution',
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        neonObservabilityService.publish({
            kind: 'run_started',
            profileId: 'profile_default',
            sessionId: 'sess_target',
            runId: 'run_target',
            providerId: 'openai',
            modelId: 'gpt-test',
            source: 'runtime.run_execution',
            topLevelTab: 'agent',
            modeKey: 'code',
        });

        unsubscribe();

        expect(seenRunIds).toEqual(['run_target']);
    });
});
