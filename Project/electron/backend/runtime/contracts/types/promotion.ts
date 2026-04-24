import type { EntityId } from '@/app/backend/runtime/contracts/ids';

export type PromotionSource =
    | {
          kind: 'message';
          sessionId: EntityId<'sess'>;
          messageId: EntityId<'msg'>;
      }
    | {
          kind: 'tool_result_artifact_window';
          sessionId: EntityId<'sess'>;
          messagePartId: EntityId<'part'>;
          startLine: number;
          lineCount: number;
      };

export interface PromotionSourceSummary {
    kind: PromotionSource['kind'];
    label: string;
    digest: string;
    lineCount: number;
}

export interface PromotionProvenance {
    sourceKind: PromotionSource['kind'];
    sourceSessionId: EntityId<'sess'>;
    sourceMessageId?: EntityId<'msg'>;
    sourceMessagePartId?: EntityId<'part'>;
    sourceLabel: string;
    sourceDigest: string;
    startLine?: number;
    lineCount?: number;
    promotedAt: string;
}
