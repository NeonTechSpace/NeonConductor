import type { ModelPickerProps } from '@/web/components/modelSelection/modelPicker.types';
import { buildModelPickerReadModel } from '@/web/components/modelSelection/modelPickerReadModel';
import { ModelPickerPopoverView } from '@/web/components/modelSelection/modelPickerPopoverView';
import { useModelPickerPopoverController } from '@/web/components/modelSelection/useModelPickerPopoverController';

export type { ModelPickerProps } from '@/web/components/modelSelection/modelPicker.types';
export {
    buildModelPickerReadModel,
    getModelLabelCollisionIndex,
    getOptionDisplayText,
} from '@/web/components/modelSelection/modelPickerReadModel';
export { shouldUsePopoverModelPicker } from '@/web/components/modelSelection/shouldUsePopoverModelPicker';

function PopoverModelPicker(props: ModelPickerProps) {
    const controller = useModelPickerPopoverController(props.disabled !== undefined ? { disabled: props.disabled } : {});
    const readModel = buildModelPickerReadModel({
        models: props.models,
        selectedModelId: props.selectedModelId,
        ...(props.favoriteModels ? { favoriteModels: props.favoriteModels } : {}),
        ...(props.roleDefaultReferences ? { roleDefaultReferences: props.roleDefaultReferences } : {}),
    });

    return <ModelPickerPopoverView {...props} controller={controller} readModel={readModel} />;
}

export function ModelPicker(props: ModelPickerProps) {
    return <PopoverModelPicker {...props} />;
}
