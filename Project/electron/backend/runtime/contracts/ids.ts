import { randomUUID } from 'node:crypto';

export type EntityIdPrefix =
    | 'ws'
    | 'thr'
    | 'wt'
    | 'run'
    | 'msg'
    | 'part'
    | 'tag'
    | 'sess'
    | 'perm'
    | 'ckpt'
    | 'plan'
    | 'orch'
    | 'step'
    | 'tool'
    | 'mcp'
    | 'provider'
    | 'model'
    | 'evt';

export type EntityId<P extends EntityIdPrefix = EntityIdPrefix> = `${P}_${string}`;

export function createEntityId<P extends EntityIdPrefix>(prefix: P): EntityId<P> {
    return `${prefix}_${randomUUID()}`;
}
