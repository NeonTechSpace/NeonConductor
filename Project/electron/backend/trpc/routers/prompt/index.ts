import {
    promptLayerApplyModeDraftInputSchema,
    promptLayerCreateModeDraftInputSchema,
    promptLayerCreateCustomModeInputSchema,
    promptLayerDiscardModeDraftInputSchema,
    promptLayerDeleteCustomModeInputSchema,
    promptLayerExportCustomModeInputSchema,
    promptLayerGetCustomModeInputSchema,
    promptLayerGetSettingsInputSchema,
    promptLayerImportCustomModeInputSchema,
    promptLayerResetPreparedContextProfileDefaultsInputSchema,
    promptLayerResetBuiltInModePromptInputSchema,
    promptLayerResetAppGlobalInstructionsInputSchema,
    promptLayerResetProfileGlobalInstructionsInputSchema,
    promptLayerResetTopLevelInstructionsInputSchema,
    promptLayerSetBuiltInModePromptInputSchema,
    promptLayerSetPreparedContextProfileDefaultsInputSchema,
    promptLayerSetAppGlobalInstructionsInputSchema,
    promptLayerSetProfileGlobalInstructionsInputSchema,
    promptLayerSetTopLevelInstructionsInputSchema,
    promptLayerUpdateCustomModeInputSchema,
    promptLayerUpdateModeDraftInputSchema,
    promptLayerValidateModeDraftInputSchema,
} from '@/app/backend/runtime/contracts';
import {
    applyModeDraft,
    createModeDraft,
    createCustomMode,
    discardModeDraft,
    deleteCustomMode,
    exportCustomMode,
    getCustomMode,
    getPromptLayerSettings,
    importCustomModeToDraft,
    resetBuiltInModePrompt,
    resetAppGlobalInstructions,
    resetPreparedContextProfileDefaults,
    resetProfileGlobalInstructions,
    resetTopLevelInstructions,
    setBuiltInModePrompt,
    setAppGlobalInstructions,
    setPreparedContextProfileDefaults,
    setProfileGlobalInstructions,
    setTopLevelInstructions,
    updateCustomMode,
    updateModeDraft,
    validateModeDraft,
} from '@/app/backend/runtime/services/promptLayers/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { raiseMappedTrpcError, toTrpcError } from '@/app/backend/trpc/trpcErrorMap';

export const promptRouter = router({
    getSettings: publicProcedure.input(promptLayerGetSettingsInputSchema).query(async ({ input }) => {
        return {
            settings: await getPromptLayerSettings(input.profileId, input.workspaceFingerprint),
        };
    }),
    listModeDrafts: publicProcedure.input(promptLayerGetSettingsInputSchema).query(async ({ input }) => {
        return {
            modeDrafts: (await getPromptLayerSettings(input.profileId, input.workspaceFingerprint)).modeDrafts,
        };
    }),
    setAppGlobalInstructions: publicProcedure
        .input(promptLayerSetAppGlobalInstructionsInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: await setAppGlobalInstructions(input),
            };
        }),
    resetAppGlobalInstructions: publicProcedure
        .input(promptLayerResetAppGlobalInstructionsInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: await resetAppGlobalInstructions(input.profileId),
            };
        }),
    setProfileGlobalInstructions: publicProcedure
        .input(promptLayerSetProfileGlobalInstructionsInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: await setProfileGlobalInstructions(input),
            };
        }),
    resetProfileGlobalInstructions: publicProcedure
        .input(promptLayerResetProfileGlobalInstructionsInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: await resetProfileGlobalInstructions(input.profileId),
            };
        }),
    setTopLevelInstructions: publicProcedure
        .input(promptLayerSetTopLevelInstructionsInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: await setTopLevelInstructions(input),
            };
        }),
    setPreparedContextProfileDefaults: publicProcedure
        .input(promptLayerSetPreparedContextProfileDefaultsInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: await setPreparedContextProfileDefaults(input),
            };
        }),
    resetPreparedContextProfileDefaults: publicProcedure
        .input(promptLayerResetPreparedContextProfileDefaultsInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: await resetPreparedContextProfileDefaults(input.profileId),
            };
        }),
    resetTopLevelInstructions: publicProcedure
        .input(promptLayerResetTopLevelInstructionsInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: await resetTopLevelInstructions(input),
            };
        }),
    setBuiltInModePrompt: publicProcedure
        .input(promptLayerSetBuiltInModePromptInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: (await setBuiltInModePrompt(input)).match(
                    (value) => value,
                    (error) => raiseMappedTrpcError(error, toTrpcError)
                ),
            };
        }),
    resetBuiltInModePrompt: publicProcedure
        .input(promptLayerResetBuiltInModePromptInputSchema)
        .mutation(async ({ input }) => {
            return {
                settings: (await resetBuiltInModePrompt(input)).match(
                    (value) => value,
                    (error) => raiseMappedTrpcError(error, toTrpcError)
                ),
            };
        }),
    getCustomMode: publicProcedure.input(promptLayerGetCustomModeInputSchema).query(async ({ input }) => {
        return (await getCustomMode(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
    }),
    createCustomMode: publicProcedure.input(promptLayerCreateCustomModeInputSchema).mutation(async ({ input }) => {
        return {
            settings: (await createCustomMode(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
    updateCustomMode: publicProcedure.input(promptLayerUpdateCustomModeInputSchema).mutation(async ({ input }) => {
        return {
            settings: (await updateCustomMode(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
    deleteCustomMode: publicProcedure.input(promptLayerDeleteCustomModeInputSchema).mutation(async ({ input }) => {
        return {
            settings: (await deleteCustomMode(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
    exportCustomMode: publicProcedure.input(promptLayerExportCustomModeInputSchema).mutation(async ({ input }) => {
        return (await exportCustomMode(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
    }),
    importCustomMode: publicProcedure.input(promptLayerImportCustomModeInputSchema).mutation(async ({ input }) => {
        return (await importCustomModeToDraft(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
    }),
    createModeDraft: publicProcedure.input(promptLayerCreateModeDraftInputSchema).mutation(async ({ input }) => {
        return (await createModeDraft(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
    }),
    updateModeDraft: publicProcedure.input(promptLayerUpdateModeDraftInputSchema).mutation(async ({ input }) => {
        return (await updateModeDraft(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
    }),
    validateModeDraft: publicProcedure
        .input(promptLayerValidateModeDraftInputSchema)
        .mutation(async ({ input }) => {
            return (await validateModeDraft(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            );
        }),
    applyModeDraft: publicProcedure.input(promptLayerApplyModeDraftInputSchema).mutation(async ({ input }) => {
        return (await applyModeDraft(input)).match(
            (value) => value,
            (error) => raiseMappedTrpcError(error, toTrpcError)
        );
    }),
    discardModeDraft: publicProcedure.input(promptLayerDiscardModeDraftInputSchema).mutation(async ({ input }) => {
        return {
            settings: (await discardModeDraft(input)).match(
                (value) => value,
                (error) => raiseMappedTrpcError(error, toTrpcError)
            ),
        };
    }),
});
