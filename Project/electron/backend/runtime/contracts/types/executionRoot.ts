import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ResolvedWorkspaceContext } from '@/app/backend/runtime/contracts/types/sandbox';

export type ResolvedExecutionRoot =
    | {
          kind: 'detached';
      }
    | {
          kind: 'unresolved';
          source: 'workspace';
          workspaceFingerprint: string;
          label: string;
          reason: 'workspace_root_missing';
      }
    | {
          kind: 'workspace';
          workspaceFingerprint: string;
          label: string;
          absolutePath: string;
      }
    | {
          kind: 'sandbox';
          workspaceFingerprint: string;
          label: string;
          absolutePath: string;
          sandboxId: EntityId<'sb'>;
          baseWorkspace: {
              label: string;
              absolutePath: string;
          };
      }
    | {
          kind: 'research_checkout';
          label: string;
          absolutePath: string;
          canonicalKey: string;
      };

export type ResolvedFileToolExecutionRoot = Extract<
    ResolvedExecutionRoot,
    { kind: 'workspace' | 'sandbox' | 'research_checkout' }
>;

export function toResolvedExecutionRoot(workspaceContext: ResolvedWorkspaceContext): ResolvedExecutionRoot {
    if (workspaceContext.kind === 'detached') {
        return { kind: 'detached' };
    }

    if (workspaceContext.kind === 'workspace_unresolved') {
        return {
            kind: 'unresolved',
            source: 'workspace',
            workspaceFingerprint: workspaceContext.workspaceFingerprint,
            label: workspaceContext.label,
            reason: workspaceContext.reason,
        };
    }

    if (workspaceContext.kind === 'sandbox') {
        return {
            kind: 'sandbox',
            workspaceFingerprint: workspaceContext.workspaceFingerprint,
            label: workspaceContext.label,
            absolutePath: workspaceContext.absolutePath,
            sandboxId: workspaceContext.sandbox.id,
            baseWorkspace: workspaceContext.baseWorkspace,
        };
    }

    return {
        kind: 'workspace',
        workspaceFingerprint: workspaceContext.workspaceFingerprint,
        label: workspaceContext.label,
        absolutePath: workspaceContext.absolutePath,
    };
}
