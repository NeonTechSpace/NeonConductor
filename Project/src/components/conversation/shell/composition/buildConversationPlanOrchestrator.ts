import {
    createPlanImplementationController,
    type ConversationPlanActionController,
    type CreatePlanImplementationControllerInput,
} from '@/web/components/conversation/shell/composition/planImplementationController';
import type { ModeExecutionPanelProps } from '@/web/components/conversation/panels/modeExecutionPanel';

export interface BuildConversationPlanOrchestratorInput extends CreatePlanImplementationControllerInput {
    activePlan: ModeExecutionPanelProps['activePlan'];
    orchestratorView: ModeExecutionPanelProps['orchestratorView'];
    selectedExecutionStrategy?: ModeExecutionPanelProps['selectedExecutionStrategy'];
}

export interface ConversationPlanOrchestrator {
    activePlan: ModeExecutionPanelProps['activePlan'];
    orchestratorView: ModeExecutionPanelProps['orchestratorView'];
    actionController: ConversationPlanActionController;
}

export function buildConversationPlanOrchestrator(
    input: BuildConversationPlanOrchestratorInput
): ConversationPlanOrchestrator {
    const { activePlan, orchestratorView, ...controllerInput } = input;

    return {
        activePlan,
        orchestratorView,
        actionController: createPlanImplementationController(controllerInput),
    };
}
