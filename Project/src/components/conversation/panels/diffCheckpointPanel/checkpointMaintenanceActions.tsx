import {
    CheckpointHistorySection,
    type CheckpointHistorySectionProps,
} from '@/web/components/conversation/panels/diffCheckpointPanel/checkpointHistorySection';

export type CheckpointMaintenanceActionsProps = CheckpointHistorySectionProps;

export function CheckpointMaintenanceActions(input: CheckpointMaintenanceActionsProps) {
    return <CheckpointHistorySection {...input} />;
}
