import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface DiffListByRunInput extends ProfileInput {
    runId: EntityId<'run'>;
}

export interface DiffGetFilePatchInput extends ProfileInput {
    diffId: string;
    path: string;
}
