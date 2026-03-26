import type {
    ThreadEntrySubmitResult,
    WorkspaceLifecycleResult,
} from '@/web/components/conversation/sidebar/sidebarTypes';
import { trpc } from '@/web/trpc/client';

import type { WorkspaceRootRecord } from '@/shared/contracts';
import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

interface UseSidebarWorkspaceCreateControllerInput {
    profileId: string;
    onCreateThread: (input: {
        workspaceFingerprint: string;
        workspaceAbsolutePath: string;
        title: string;
        topLevelTab: TopLevelTab;
        providerId?: RuntimeProviderId;
        modelId?: string;
    }) => Promise<ThreadEntrySubmitResult>;
}

export async function submitSidebarWorkspaceLifecycle(input: {
    profileId: string;
    absolutePath: string;
    label: string;
    defaultTopLevelTab: TopLevelTab;
    defaultProviderId: RuntimeProviderId | undefined;
    defaultModelId: string;
    registerWorkspaceRoot: (args: { profileId: string; absolutePath: string; label: string }) => Promise<{
        workspaceRoot: WorkspaceRootRecord;
    }>;
    setWorkspacePreference: (args: {
        profileId: string;
        workspaceFingerprint: string;
        defaultTopLevelTab: TopLevelTab;
        defaultProviderId?: RuntimeProviderId;
        defaultModelId?: string;
    }) => Promise<unknown>;
    onCreateThread: UseSidebarWorkspaceCreateControllerInput['onCreateThread'];
}): Promise<WorkspaceLifecycleResult> {
    try {
        const result = await input.registerWorkspaceRoot({
            profileId: input.profileId,
            absolutePath: input.absolutePath,
            label: input.label,
        });

        await input.setWorkspacePreference({
            profileId: input.profileId,
            workspaceFingerprint: result.workspaceRoot.fingerprint,
            defaultTopLevelTab: input.defaultTopLevelTab,
            ...(input.defaultProviderId
                ? {
                      defaultProviderId: input.defaultProviderId,
                      defaultModelId: input.defaultModelId,
                  }
                : {}),
        });

        const starterThreadResult = await input.onCreateThread({
            workspaceFingerprint: result.workspaceRoot.fingerprint,
            workspaceAbsolutePath: result.workspaceRoot.absolutePath,
            title: '',
            topLevelTab: input.defaultTopLevelTab,
            ...(input.defaultProviderId && input.defaultModelId
                ? {
                      providerId: input.defaultProviderId,
                      modelId: input.defaultModelId,
                  }
                : {}),
        });

        if (starterThreadResult.kind === 'failed') {
            return {
                kind: 'created_without_starter_thread',
                workspaceRoot: result.workspaceRoot,
                draftState: {
                    workspaceFingerprint: result.workspaceRoot.fingerprint,
                    title: '',
                    topLevelTab: input.defaultTopLevelTab,
                    providerId: input.defaultProviderId,
                    modelId: input.defaultModelId,
                },
                message: starterThreadResult.message,
            };
        }

        return {
            kind: 'created_with_starter_thread',
            workspaceRoot: result.workspaceRoot,
            threadEntryResult: starterThreadResult,
        };
    } catch (error) {
        return {
            kind: 'failed',
            message: error instanceof Error ? error.message : 'Workspace could not be created.',
        };
    }
}

export function useSidebarWorkspaceCreateController(input: UseSidebarWorkspaceCreateControllerInput) {
    const utils = trpc.useUtils();
    const registerWorkspaceRootMutation = trpc.runtime.registerWorkspaceRoot.useMutation();
    const setWorkspacePreferenceMutation = trpc.runtime.setWorkspacePreference.useMutation({
        onSuccess: ({ workspacePreference }) => {
            utils.runtime.getShellBootstrap.setData({ profileId: input.profileId }, (current) =>
                current
                    ? {
                          ...current,
                          workspacePreferences: [
                              workspacePreference,
                              ...current.workspacePreferences.filter(
                                  (record) => record.workspaceFingerprint !== workspacePreference.workspaceFingerprint
                              ),
                          ],
                      }
                    : current
            );
        },
    });

    return {
        busy: registerWorkspaceRootMutation.isPending || setWorkspacePreferenceMutation.isPending,
        async submitWorkspaceCreate(workspaceInput: {
            absolutePath: string;
            label: string;
            defaultTopLevelTab: TopLevelTab;
            defaultProviderId: RuntimeProviderId | undefined;
            defaultModelId: string;
        }) {
            return await submitSidebarWorkspaceLifecycle({
                profileId: input.profileId,
                absolutePath: workspaceInput.absolutePath,
                label: workspaceInput.label,
                defaultTopLevelTab: workspaceInput.defaultTopLevelTab,
                defaultProviderId: workspaceInput.defaultProviderId,
                defaultModelId: workspaceInput.defaultModelId,
                registerWorkspaceRoot: async (args) => {
                    const result = await registerWorkspaceRootMutation.mutateAsync(args);
                    utils.runtime.listWorkspaceRoots.setData({ profileId: input.profileId }, (current) => ({
                        workspaceRoots: current
                            ? [
                                  result.workspaceRoot,
                                  ...current.workspaceRoots.filter(
                                      (workspaceRoot) => workspaceRoot.fingerprint !== result.workspaceRoot.fingerprint
                                  ),
                              ]
                            : [result.workspaceRoot],
                    }));
                    utils.runtime.getShellBootstrap.setData({ profileId: input.profileId }, (current) =>
                        current
                            ? {
                                  ...current,
                                  workspaceRoots: [
                                      result.workspaceRoot,
                                      ...current.workspaceRoots.filter(
                                          (workspaceRoot) =>
                                              workspaceRoot.fingerprint !== result.workspaceRoot.fingerprint
                                      ),
                                  ],
                              }
                            : current
                    );
                    return result;
                },
                setWorkspacePreference: async (args) => {
                    await setWorkspacePreferenceMutation.mutateAsync(args);
                },
                onCreateThread: input.onCreateThread,
            });
        },
    };
}
