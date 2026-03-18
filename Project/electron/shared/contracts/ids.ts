export type EntityIdPrefix =
    | 'ws'
    | 'mem'
    | 'mfact'
    | 'mlink'
    | 'chg'
    | 'thr'
    | 'wt'
    | 'run'
    | 'msg'
    | 'part'
    | 'media'
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

export function isEntityId<P extends EntityIdPrefix>(value: string, prefix: P): value is EntityId<P> {
    return value.startsWith(`${prefix}_`);
}
