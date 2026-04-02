import os from 'node:os';

import type { PlanResearchCapacityView } from '@/app/backend/runtime/contracts';

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function readAvailableParallelism(): number {
    if (typeof os.availableParallelism === 'function') {
        const availableParallelism = os.availableParallelism();
        if (Number.isInteger(availableParallelism) && availableParallelism > 0) {
            return availableParallelism;
        }
    }

    const cpuCount = os.cpus().length;
    if (Number.isInteger(cpuCount) && cpuCount > 0) {
        return cpuCount;
    }

    return 4;
}

export function readPlannerResearchCapacity(): PlanResearchCapacityView {
    const availableParallelism = readAvailableParallelism();
    const recommendedWorkerCount = clamp(Math.min(3, availableParallelism - 2), 1, availableParallelism);
    const hardMaxWorkerCount = clamp(Math.min(8, availableParallelism - 1), 1, availableParallelism);

    return {
        availableParallelism,
        recommendedWorkerCount: Math.min(recommendedWorkerCount, hardMaxWorkerCount),
        hardMaxWorkerCount,
    };
}
