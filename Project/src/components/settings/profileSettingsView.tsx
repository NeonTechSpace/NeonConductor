import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { ProfileCreateSection } from '@/web/components/settings/profileSettings/profileCreateSection';
import { useProfileSettingsController } from '@/web/components/settings/profileSettings/useProfileSettingsController';
import type { ProfileSettingsSubsectionId } from '@/web/components/settings/settingsNavigation';
import { SettingsContentScaffold } from '@/web/components/settings/shared/settingsContentScaffold';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { Button } from '@/web/components/ui/button';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';

interface ProfileSettingsViewProps {
    activeProfileId: string;
    onProfileActivated: (profileId: string) => void;
    subsection?: ProfileSettingsSubsectionId;
    onSubsectionChange?: (subsection: ProfileSettingsSubsectionId) => void;
}

function InternalRoleDiagnosticBanner(input: {
    label: string;
    detail: string;
}) {
    return (
        <div className='border-border/70 bg-background/60 rounded-2xl border px-4 py-3 text-sm'>
            <p className='font-medium'>{input.label}</p>
            <p className='text-muted-foreground mt-1 text-xs leading-5'>{input.detail}</p>
        </div>
    );
}

function ProfileSelectionToolbar({
    selectedProfileId,
    profiles,
    onSelectProfile,
}: {
    selectedProfileId: string | undefined;
    profiles: Array<{ id: string; name: string }>;
    onSelectProfile: (profileId: string) => void;
}) {
    return (
        <label className='space-y-1'>
            <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>
                Selected Profile
            </span>
            <select
                aria-label='Selected profile'
                className='border-border bg-background h-10 min-w-[220px] rounded-xl border px-3 text-sm'
                value={selectedProfileId ?? ''}
                onChange={(event) => {
                    const nextProfileId = event.target.value.trim();
                    if (nextProfileId.length > 0) {
                        onSelectProfile(nextProfileId);
                    }
                }}>
                {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                        {profile.name}
                    </option>
                ))}
            </select>
        </label>
    );
}

function ProfileManagementScreen({
    controller,
    activeProfileId,
}: {
    controller: ReturnType<typeof useProfileSettingsController>;
    activeProfileId: string;
}) {
    const selectedProfile = controller.library.selectedProfile;
    if (!selectedProfile) {
        return null;
    }

    return (
        <div className='space-y-5'>
            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Identity</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Change the selected profile name, duplicate it, or switch the active profile used elsewhere in
                        the shell.
                    </p>
                </div>

                <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]'>
                    <label className='sr-only' htmlFor='profile-rename-input'>
                        Profile name
                    </label>
                    <input
                        id='profile-rename-input'
                        name='profileRename'
                        type='text'
                        value={controller.library.renameValue}
                        onChange={(event) => {
                            controller.library.setRenameValue(event.target.value);
                        }}
                        className='border-border bg-background h-10 rounded-xl border px-3 text-sm'
                        autoComplete='off'
                        placeholder='Profile name…'
                    />
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={
                            controller.library.renameMutation.isPending ||
                            controller.library.renameValue.trim().length === 0 ||
                            controller.library.renameValue.trim() === selectedProfile.name
                        }
                        onClick={() => {
                            void controller.library.renameProfile();
                        }}>
                        Rename
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={controller.library.duplicateMutation.isPending}
                        onClick={() => {
                            void controller.library.duplicateProfile();
                        }}>
                        Duplicate
                    </Button>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={
                            controller.library.setActiveMutation.isPending || selectedProfile.id === activeProfileId
                        }
                        onClick={() => {
                            void controller.library.activateProfile();
                        }}>
                        {selectedProfile.id === activeProfileId ? 'Active' : 'Set Active'}
                    </Button>

                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={
                            controller.library.cannotDeleteLastProfile || controller.library.deleteMutation.isPending
                        }
                        onClick={() => {
                            controller.library.setConfirmDeleteOpen(true);
                        }}>
                        Delete
                    </Button>
                    <span className='text-muted-foreground text-xs'>
                        {controller.library.cannotDeleteLastProfile
                            ? 'Cannot delete the last remaining profile.'
                            : 'Deletion removes local profile-scoped data.'}
                    </span>
                </div>
            </section>

            <ProfileCreateSection
                value={controller.library.newProfileName}
                isPending={controller.library.createMutation.isPending}
                onValueChange={controller.library.setNewProfileName}
                onCreate={() => {
                    void controller.library.createProfile();
                }}
            />
        </div>
    );
}

function ProfileExecutionScreen({ controller }: { controller: ReturnType<typeof useProfileSettingsController> }) {
    return (
        <div className='space-y-5'>
            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Execution preset</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Controls default runtime approval behavior for workspace-scoped tool access.
                    </p>
                </div>
                <select
                    aria-label='Execution preset'
                    className='border-border bg-background h-10 w-full max-w-sm rounded-xl border px-3 text-sm'
                    value={controller.preferences.executionPreset}
                    disabled={controller.preferences.setExecutionPresetMutation.isPending}
                    onChange={(event) => {
                        const nextPreset = event.target.value;
                        if (nextPreset !== 'privacy' && nextPreset !== 'standard' && nextPreset !== 'yolo') {
                            return;
                        }

                        void controller.preferences.updateExecutionPreset(nextPreset);
                    }}>
                    <option value='privacy'>Privacy: ask on every tool</option>
                    <option value='standard'>Standard: allow safe workspace reads</option>
                    <option value='yolo'>Yolo: auto-allow safe reads, deny unsafe boundaries</option>
                </select>
            </section>

            <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Conversation edit behavior</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Controls default behavior when editing earlier user messages.
                    </p>
                </div>
                <select
                    aria-label='Conversation edit behavior'
                    className='border-border bg-background h-10 w-full max-w-sm rounded-xl border px-3 text-sm'
                    value={controller.preferences.editPreference}
                    disabled={controller.preferences.setEditPreferenceMutation.isPending}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        if (nextValue !== 'ask' && nextValue !== 'truncate' && nextValue !== 'branch') {
                            return;
                        }

                        void controller.preferences.updateEditPreference(nextValue);
                    }}>
                    <option value='ask'>Ask every time</option>
                    <option value='truncate'>Always truncate</option>
                    <option value='branch'>Always branch</option>
                </select>
            </section>
        </div>
    );
}

function ProfileConversationNamingScreen({
    controller,
}: {
    controller: ReturnType<typeof useProfileSettingsController>;
}) {
    return (
        <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Conversation naming mode</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Template naming is the baseline path. Utility-backed refinement uses the shared Utility AI
                    selection, unless Conversation Naming is set to use the active conversation model in the Utility AI
                    subsection.
                </p>
            </div>
            <select
                aria-label='Conversation naming mode'
                className='border-border bg-background h-10 w-full max-w-sm rounded-xl border px-3 text-sm'
                value={controller.preferences.threadTitleMode}
                disabled={controller.preferences.setThreadTitlePreferenceMutation.isPending}
                onChange={(event) => {
                    const nextMode = event.target.value;
                    if (nextMode !== 'template' && nextMode !== 'utility_refine') {
                        return;
                    }

                    void controller.preferences.updateThreadTitleMode(nextMode);
                }}>
                <option value='template'>Template only</option>
                <option value='utility_refine'>Template + Utility AI refine</option>
            </select>
        </section>
    );
}

function ProfileUtilityAiScreen({ controller }: { controller: ReturnType<typeof useProfileSettingsController> }) {
    const utilityConsumerTogglePending = controller.preferences.setUtilityModelConsumerPreferenceMutation.isPending;
    const utilityDiagnostic = controller.preferences.internalModelRoleDiagnostics?.roles.find(
        (role) => role.role === 'utility'
    );

    function renderConsumerToggle(input: {
        label: string;
        description: string;
        checked: boolean;
        ariaLabel: string;
        onChange: (checked: boolean) => void;
    }) {
        return (
            <label className='flex items-start justify-between gap-3 rounded-xl border border-transparent px-1 py-1 text-sm'>
                <div className='space-y-1'>
                    <span className='font-medium'>{input.label}</span>
                    <p className='text-muted-foreground text-xs leading-5'>{input.description}</p>
                </div>
                <span className='relative inline-flex shrink-0 items-center'>
                    <input
                        type='checkbox'
                        role='switch'
                        aria-label={input.ariaLabel}
                        className='peer sr-only'
                        checked={input.checked}
                        disabled={utilityConsumerTogglePending}
                        onChange={(event) => {
                            input.onChange(event.target.checked);
                        }}
                    />
                    <span className='border-border peer-focus-visible:ring-ring peer-checked:bg-foreground peer-checked:border-foreground inline-flex h-6 w-11 rounded-full border bg-transparent transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50'>
                        <span className='bg-background mt-[1px] ml-[1px] h-5 w-5 rounded-full border transition-transform peer-checked:translate-x-5' />
                    </span>
                </span>
            </label>
        );
    }

    return (
        <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Shared utility model</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Neon uses this model for selected low-stakes background work. If the model is unset, unavailable, or
                    a feature toggle below is off, Neon falls back to the active conversation model for that task.
                </p>
            </div>

            {utilityDiagnostic ? (
                <InternalRoleDiagnosticBanner
                    label={`Internal Role: ${utilityDiagnostic.label}`}
                    detail={`${utilityDiagnostic.sourceLabel}${utilityDiagnostic.providerId && utilityDiagnostic.modelId ? ` · ${utilityDiagnostic.providerId}/${utilityDiagnostic.modelId}` : ''}${utilityDiagnostic.detail ? ` · ${utilityDiagnostic.detail}` : ''}`}
                />
            ) : null}

            <div className='grid gap-4 md:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)]'>
                <label className='space-y-2'>
                    <span className='text-sm font-medium'>Provider</span>
                    <select
                        aria-label='Utility AI provider'
                        className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                        value={controller.preferences.selectedUtilityProviderId ?? ''}
                        disabled={controller.preferences.setUtilityModelMutation.isPending}
                        onChange={(event) => {
                            const nextProviderId = controller.preferences.utilityProviderItems.find(
                                (provider) => provider.id === event.target.value
                            )?.id;
                            controller.preferences.setUtilityProviderId(nextProviderId);
                        }}>
                        {controller.preferences.utilityProviderItems.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                                {provider.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className='space-y-2'>
                    <span className='text-sm font-medium'>Model</span>
                    <ModelPicker
                        providerId={controller.preferences.selectedUtilityProviderId}
                        selectedModelId={controller.preferences.selectedUtilityModelId}
                        models={controller.preferences.utilityModelOptions}
                        ariaLabel='Utility AI model'
                        placeholder='Select a utility model'
                        disabled={controller.preferences.setUtilityModelMutation.isPending}
                        onSelectModel={controller.preferences.setUtilityModelId}
                        onSelectOption={(option) => {
                            if (
                                option.providerId &&
                                option.providerId !== controller.preferences.selectedUtilityProviderId
                            ) {
                                controller.preferences.setUtilityProviderId(option.providerId);
                            }
                            controller.preferences.setUtilityModelId(option.id);
                        }}
                    />
                    {controller.preferences.selectedUtilityModelOption?.compatibilityReason ? (
                        <p className='text-muted-foreground text-xs'>
                            {controller.preferences.selectedUtilityModelOption.compatibilityReason}
                        </p>
                    ) : null}
                </label>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={
                        controller.preferences.setUtilityModelMutation.isPending ||
                        !controller.preferences.selectedUtilityProviderId ||
                        controller.preferences.selectedUtilityModelId.length === 0
                    }
                    onClick={() => {
                        void controller.preferences.saveUtilityModel();
                    }}>
                    Save Utility AI
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={
                        controller.preferences.setUtilityModelMutation.isPending ||
                        !controller.preferences.utilityModelSelection
                    }
                    onClick={() => {
                        void controller.preferences.clearUtilityModel();
                    }}>
                    Clear
                </Button>
                <span className='text-muted-foreground text-xs'>
                    {controller.preferences.utilityModelSelection
                        ? `Saved model: ${controller.preferences.utilityModelSelection.providerId}/${controller.preferences.utilityModelSelection.modelId}`
                        : 'No Utility AI saved. Neon currently falls back to the active conversation model.'}
                </span>
            </div>

            <div className='border-border/70 bg-background/60 space-y-3 rounded-2xl border px-4 py-4'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Use Utility AI For</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        These switches are on by default. If a switch is off, that feature uses the active conversation
                        model instead of the shared Utility AI model.
                    </p>
                </div>

                {renderConsumerToggle({
                    label: 'Conversation Naming',
                    description: 'Applies when Conversation Naming mode is set to Utility AI refine.',
                    checked: controller.preferences.utilityModelConsumers.conversationNaming,
                    ariaLabel: 'Use Utility AI for Conversation Naming',
                    onChange: (checked) => {
                        void controller.preferences.updateUtilityModelConsumerPreference(
                            'conversation_naming',
                            checked
                        );
                    },
                })}

                {renderConsumerToggle({
                    label: 'Context Compaction',
                    description:
                        'Controls whether compaction summaries prefer Utility AI before falling back to the active conversation model.',
                    checked: controller.preferences.utilityModelConsumers.contextCompaction,
                    ariaLabel: 'Use Utility AI for Context Compaction',
                    onChange: (checked) => {
                        void controller.preferences.updateUtilityModelConsumerPreference('context_compaction', checked);
                    },
                })}
            </div>
        </section>
    );
}

function ProfileMemoryRetrievalScreen({ controller }: { controller: ReturnType<typeof useProfileSettingsController> }) {
    const hasModelOptions = controller.preferences.memoryRetrievalModelOptions.length > 0;
    const memoryRetrievalDiagnostic = controller.preferences.internalModelRoleDiagnostics?.roles.find(
        (role) => role.role === 'memory_retrieval'
    );

    return (
        <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Memory retrieval model</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Neon stores this selection for the semantic retrieval phase. It is intentionally separate from the
                    shared Utility AI model.
                </p>
            </div>

            {memoryRetrievalDiagnostic ? (
                <InternalRoleDiagnosticBanner
                    label={`Internal Role: ${memoryRetrievalDiagnostic.label}`}
                    detail={`${memoryRetrievalDiagnostic.sourceLabel}${memoryRetrievalDiagnostic.providerId && memoryRetrievalDiagnostic.modelId ? ` · ${memoryRetrievalDiagnostic.providerId}/${memoryRetrievalDiagnostic.modelId}` : ''}${memoryRetrievalDiagnostic.detail ? ` · ${memoryRetrievalDiagnostic.detail}` : ''}`}
                />
            ) : null}

            {hasModelOptions ? (
                <>
                    <div className='grid gap-4 md:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)]'>
                        <label className='space-y-2'>
                            <span className='text-sm font-medium'>Provider</span>
                            <select
                                aria-label='Memory Retrieval provider'
                                className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                                value={controller.preferences.selectedMemoryRetrievalProviderId ?? ''}
                                disabled={controller.preferences.setMemoryRetrievalModelMutation.isPending}
                                onChange={(event) => {
                                    const nextProviderId = controller.preferences.memoryRetrievalProviderItems.find(
                                        (provider) => provider.id === event.target.value
                                    )?.id;
                                    controller.preferences.setMemoryRetrievalProviderId(nextProviderId);
                                }}>
                                {controller.preferences.memoryRetrievalProviderItems.map((provider) => (
                                    <option key={provider.id} value={provider.id}>
                                        {provider.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className='space-y-2'>
                            <span className='text-sm font-medium'>Model</span>
                            <ModelPicker
                                providerId={controller.preferences.selectedMemoryRetrievalProviderId}
                                selectedModelId={controller.preferences.selectedMemoryRetrievalModelId}
                                models={controller.preferences.memoryRetrievalModelOptions}
                                ariaLabel='Memory Retrieval model'
                                placeholder='Select a memory retrieval model'
                                disabled={controller.preferences.setMemoryRetrievalModelMutation.isPending}
                                onSelectModel={controller.preferences.setMemoryRetrievalModelId}
                                onSelectOption={(option) => {
                                    if (
                                        option.providerId &&
                                        option.providerId !== controller.preferences.selectedMemoryRetrievalProviderId
                                    ) {
                                        controller.preferences.setMemoryRetrievalProviderId(option.providerId);
                                    }
                                    controller.preferences.setMemoryRetrievalModelId(option.id);
                                }}
                            />
                            {controller.preferences.selectedMemoryRetrievalModelOption?.compatibilityReason ? (
                                <p className='text-muted-foreground text-xs'>
                                    {controller.preferences.selectedMemoryRetrievalModelOption.compatibilityReason}
                                </p>
                            ) : null}
                        </label>
                    </div>

                    <div className='flex flex-wrap items-center gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={
                                controller.preferences.setMemoryRetrievalModelMutation.isPending ||
                                !controller.preferences.selectedMemoryRetrievalProviderId ||
                                controller.preferences.selectedMemoryRetrievalModelId.length === 0
                            }
                            onClick={() => {
                                void controller.preferences.saveMemoryRetrievalModel();
                            }}>
                            Save Memory Retrieval
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={
                                controller.preferences.setMemoryRetrievalModelMutation.isPending ||
                                !controller.preferences.memoryRetrievalModelSelection
                            }
                            onClick={() => {
                                void controller.preferences.clearMemoryRetrievalModel();
                            }}>
                            Clear
                        </Button>
                        <span className='text-muted-foreground text-xs'>
                            {controller.preferences.memoryRetrievalModelSelection
                                ? `Saved model: ${controller.preferences.memoryRetrievalModelSelection.providerId}/${controller.preferences.memoryRetrievalModelSelection.modelId}`
                                : 'No Memory Retrieval model saved yet.'}
                        </span>
                    </div>
                </>
            ) : (
                <div className='border-border/70 bg-background/60 text-muted-foreground rounded-2xl border border-dashed px-4 py-5 text-sm leading-6'>
                    No compatible memory retrieval models are available right now.
                </div>
            )}
        </section>
    );
}

function ProfileFileReadsScreen({ controller }: { controller: ReturnType<typeof useProfileSettingsController> }) {
    const fileReadGuard = controller.fileReadGuard;
    const defaultAllowedExtensions = fileReadGuard.policy?.defaultAllowedExtensions ?? [];
    const defaultBlockedPatterns = fileReadGuard.policy?.defaultBlockedPatterns ?? [];

    return (
        <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Model-visible file reads</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Neon applies this guard before files are attached to prompts or returned through the native
                    read_file tool. Shell commands and internal runtime files are controlled by their own authority
                    boundaries.
                </p>
            </div>

            <div className='grid gap-4 lg:grid-cols-2'>
                <div className='border-border/70 bg-background/60 rounded-2xl border px-4 py-3'>
                    <p className='text-sm font-medium'>Default allowlist</p>
                    <p className='text-muted-foreground mt-2 text-xs leading-5'>
                        {defaultAllowedExtensions.join(', ')}
                    </p>
                </div>
                <div className='border-border/70 bg-background/60 rounded-2xl border px-4 py-3'>
                    <p className='text-sm font-medium'>Default secret blocks</p>
                    <p className='text-muted-foreground mt-2 text-xs leading-5'>
                        {defaultBlockedPatterns.join(', ')}
                    </p>
                </div>
            </div>

            <div className='grid gap-4 lg:grid-cols-2'>
                <label className='space-y-2'>
                    <span className='text-sm font-medium'>Additional allowed extensions</span>
                    <textarea
                        aria-label='Additional allowed extensions'
                        className='border-border bg-background min-h-32 w-full rounded-xl border px-3 py-2 text-sm'
                        value={fileReadGuard.allowedExtensionsText}
                        disabled={fileReadGuard.setSettingsMutation.isPending}
                        placeholder={'.log\n.conf'}
                        onChange={(event) => {
                            fileReadGuard.setAllowedExtensionsText(event.target.value);
                        }}
                    />
                </label>
                <label className='space-y-2'>
                    <span className='text-sm font-medium'>Additional blocked patterns</span>
                    <textarea
                        aria-label='Additional blocked patterns'
                        className='border-border bg-background min-h-32 w-full rounded-xl border px-3 py-2 text-sm'
                        value={fileReadGuard.blockedPatternsText}
                        disabled={fileReadGuard.setSettingsMutation.isPending}
                        placeholder={'prod-secret\ncustomer-token'}
                        onChange={(event) => {
                            fileReadGuard.setBlockedPatternsText(event.target.value);
                        }}
                    />
                </label>
            </div>

            <div className='grid gap-3 md:grid-cols-3'>
                <label className='space-y-2'>
                    <span className='text-sm font-medium'>Text size limit</span>
                    <input
                        aria-label='Text file byte limit'
                        className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                        value={fileReadGuard.maxTextFileBytesText}
                        disabled={fileReadGuard.setSettingsMutation.isPending}
                        inputMode='numeric'
                        onChange={(event) => {
                            fileReadGuard.setMaxTextFileBytesText(event.target.value);
                        }}
                    />
                </label>
                <label className='flex items-center gap-2 text-sm'>
                    <input
                        type='checkbox'
                        checked={fileReadGuard.allowUnknownUtf8Text}
                        disabled={fileReadGuard.setSettingsMutation.isPending}
                        onChange={(event) => {
                            fileReadGuard.setAllowUnknownUtf8Text(event.target.checked);
                        }}
                    />
                    Allow unknown UTF-8 text
                </label>
                <label className='flex items-center gap-2 text-sm'>
                    <input
                        type='checkbox'
                        checked={fileReadGuard.allowSecretLikeTextFiles}
                        disabled={fileReadGuard.setSettingsMutation.isPending}
                        onChange={(event) => {
                            fileReadGuard.setAllowSecretLikeTextFiles(event.target.checked);
                        }}
                    />
                    Allow secret-like text files
                </label>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={fileReadGuard.setSettingsMutation.isPending}
                    onClick={() => {
                        void fileReadGuard.saveSettings();
                    }}>
                    Save File Reads
                </Button>
                <span className='text-muted-foreground text-xs'>
                    Profile overrides are normalized before they are saved.
                </span>
            </div>
        </section>
    );
}

function getProfileSectionMetadata(subsection: ProfileSettingsSubsectionId): {
    title: string;
    description: string;
} {
    switch (subsection) {
        case 'management':
            return {
                title: 'Profile Management',
                description:
                    'Rename, duplicate, activate, delete, and create profiles without nesting another navigation rail inside Settings.',
            };
        case 'execution':
            return {
                title: 'Execution Defaults',
                description:
                    'Keep profile-level runtime approvals and edit-flow defaults together instead of burying them inside profile management.',
            };
        case 'naming':
            return {
                title: 'Conversation Naming',
                description:
                    'Control how new conversation names are generated. Utility-backed refinement uses the shared Utility AI model unless that feature is set to use the active conversation model.',
            };
        case 'utility':
            return {
                title: 'Utility AI',
                description:
                    'Choose the internal utility role target and control which profile features use it before they fall back to the active conversation model.',
            };
        case 'memoryRetrieval':
            return {
                title: 'Memory Retrieval',
                description:
                    'Choose the dedicated internal memory retrieval role target for semantic retrieval work. This stays separate from Utility AI.',
            };
        case 'fileReads':
            return {
                title: 'File Reads',
                description:
                    'Control the default-deny guard for files that can become model-visible through attachments and read_file.',
            };
    }
}

export function ProfileSettingsView({
    activeProfileId,
    onProfileActivated,
    subsection = 'management',
}: ProfileSettingsViewProps) {
    const controller = useProfileSettingsController({
        activeProfileId,
        onProfileActivated,
    });
    const sectionMetadata = getProfileSectionMetadata(subsection);

    return (
        <>
            <SettingsContentScaffold
                eyebrow='Profiles'
                title={sectionMetadata.title}
                description={sectionMetadata.description}
                toolbar={
                    <ProfileSelectionToolbar
                        selectedProfileId={controller.selection.selectedProfileId}
                        profiles={controller.selection.profiles}
                        onSelectProfile={(profileId) => {
                            controller.selection.setSelectedProfileId(profileId);
                        }}
                    />
                }>
                <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

                {subsection === 'management' ? (
                    <ProfileManagementScreen controller={controller} activeProfileId={activeProfileId} />
                ) : null}
                {subsection === 'execution' ? <ProfileExecutionScreen controller={controller} /> : null}
                {subsection === 'naming' ? <ProfileConversationNamingScreen controller={controller} /> : null}
                {subsection === 'utility' ? <ProfileUtilityAiScreen controller={controller} /> : null}
                {subsection === 'memoryRetrieval' ? <ProfileMemoryRetrievalScreen controller={controller} /> : null}
                {subsection === 'fileReads' ? <ProfileFileReadsScreen controller={controller} /> : null}
            </SettingsContentScaffold>

            <ConfirmDialog
                open={controller.library.confirmDeleteOpen}
                title='Delete Profile'
                message='Delete this profile and all local profile-scoped runtime data? This cannot be undone.'
                confirmLabel='Delete profile'
                destructive
                busy={controller.library.deleteMutation.isPending}
                onCancel={() => {
                    controller.library.setConfirmDeleteOpen(false);
                }}
                onConfirm={() => {
                    void controller.library.deleteProfile();
                }}
            />
        </>
    );
}
