import { Button } from '@/web/components/ui/button';

interface ProfileSelectedSectionProps {
    activeProfileId: string;
    selectedProfile: { id: string; name: string };
    renameValue: string;
    isRenaming: boolean;
    isDuplicating: boolean;
    isSettingActive: boolean;
    cannotDeleteLastProfile: boolean;
    isDeleting: boolean;
    executionPreset: 'privacy' | 'standard' | 'yolo';
    isSavingExecutionPreset: boolean;
    editPreference: 'ask' | 'truncate' | 'branch';
    isSavingEditPreference: boolean;
    threadTitleMode: 'template' | 'ai_optional';
    threadTitleAiModelInput: string;
    isSavingThreadTitlePreference: boolean;
    onRenameValueChange: (value: string) => void;
    onRename: () => void;
    onDuplicate: () => void;
    onActivate: () => void;
    onOpenDelete: () => void;
    onExecutionPresetChange: (value: 'privacy' | 'standard' | 'yolo') => void;
    onEditPreferenceChange: (value: 'ask' | 'truncate' | 'branch') => void;
    onThreadTitleModeChange: (value: 'template' | 'ai_optional') => void;
    onThreadTitleAiModelInputChange: (value: string) => void;
    onSaveThreadTitleAiModel: () => void;
}

export function ProfileSelectedSection({
    activeProfileId,
    selectedProfile,
    renameValue,
    isRenaming,
    isDuplicating,
    isSettingActive,
    cannotDeleteLastProfile,
    isDeleting,
    executionPreset,
    isSavingExecutionPreset,
    editPreference,
    isSavingEditPreference,
    threadTitleMode,
    threadTitleAiModelInput,
    isSavingThreadTitlePreference,
    onRenameValueChange,
    onRename,
    onDuplicate,
    onActivate,
    onOpenDelete,
    onExecutionPresetChange,
    onEditPreferenceChange,
    onThreadTitleModeChange,
    onThreadTitleAiModelInputChange,
    onSaveThreadTitleAiModel,
}: ProfileSelectedSectionProps) {
    return (
        <section className='space-y-3'>
            <p className='text-sm font-semibold'>Selected Profile</p>
            <div className='grid grid-cols-[1fr_auto_auto] gap-2'>
                <label className='sr-only' htmlFor='profile-rename-input'>
                    Profile name
                </label>
                <input
                    id='profile-rename-input'
                    name='profileRename'
                    type='text'
                    value={renameValue}
                    onChange={(event) => {
                        onRenameValueChange(event.target.value);
                    }}
                    className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                    autoComplete='off'
                    placeholder='Profile name…'
                />
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isRenaming || renameValue.trim().length === 0 || renameValue.trim() === selectedProfile.name}
                    onClick={onRename}>
                    Rename
                </Button>
                <Button type='button' size='sm' variant='outline' disabled={isDuplicating} onClick={onDuplicate}>
                    Duplicate
                </Button>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isSettingActive || selectedProfile.id === activeProfileId}
                    onClick={onActivate}>
                    {selectedProfile.id === activeProfileId ? 'Active' : 'Set Active'}
                </Button>

                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={cannotDeleteLastProfile || isDeleting}
                    onClick={onOpenDelete}>
                    Delete
                </Button>
                <span className='text-muted-foreground text-xs'>
                    {cannotDeleteLastProfile
                        ? 'Cannot delete the last remaining profile.'
                        : 'Deletion removes local profile-scoped data.'}
                </span>
            </div>

            <div className='space-y-1 pt-2'>
                <p className='text-sm font-semibold'>Execution Preset</p>
                <p className='text-muted-foreground text-xs'>
                    Controls default runtime approval behavior for workspace-scoped tool access.
                </p>
                <select
                    aria-label='Execution preset'
                    className='border-border bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm'
                    value={executionPreset}
                    disabled={isSavingExecutionPreset}
                    onChange={(event) => {
                        const nextPreset = event.target.value;
                        if (nextPreset !== 'privacy' && nextPreset !== 'standard' && nextPreset !== 'yolo') {
                            return;
                        }

                        onExecutionPresetChange(nextPreset);
                    }}>
                    <option value='privacy'>Privacy: ask on every tool</option>
                    <option value='standard'>Standard: allow safe workspace reads</option>
                    <option value='yolo'>Yolo: auto-allow safe reads, deny unsafe boundaries</option>
                </select>
            </div>

            <div className='space-y-1 pt-2'>
                <p className='text-sm font-semibold'>Conversation Edit Behavior</p>
                <p className='text-muted-foreground text-xs'>
                    Controls default behavior when editing earlier user messages.
                </p>
                <select
                    aria-label='Conversation edit behavior'
                    className='border-border bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm'
                    value={editPreference}
                    disabled={isSavingEditPreference}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        if (nextValue !== 'ask' && nextValue !== 'truncate' && nextValue !== 'branch') {
                            return;
                        }

                        onEditPreferenceChange(nextValue);
                    }}>
                    <option value='ask'>Ask every time</option>
                    <option value='truncate'>Always truncate</option>
                    <option value='branch'>Always branch</option>
                </select>
            </div>

            <div className='space-y-1 pt-2'>
                <p className='text-sm font-semibold'>Thread Title Generation</p>
                <p className='text-muted-foreground text-xs'>
                    Controls how new thread titles are generated from provider/model and prompt context.
                </p>
                <select
                    aria-label='Thread title generation mode'
                    className='border-border bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm'
                    value={threadTitleMode}
                    disabled={isSavingThreadTitlePreference}
                    onChange={(event) => {
                        const nextMode = event.target.value;
                        if (nextMode !== 'template' && nextMode !== 'ai_optional') {
                            return;
                        }

                        onThreadTitleModeChange(nextMode);
                    }}>
                    <option value='template'>Template only</option>
                    <option value='ai_optional'>Template + optional AI refine</option>
                </select>
                <label className='sr-only' htmlFor='thread-title-model-input'>
                    Thread title AI model
                </label>
                <input
                    id='thread-title-model-input'
                    name='threadTitleAiModel'
                    type='text'
                    value={threadTitleAiModelInput}
                    onChange={(event) => {
                        onThreadTitleAiModelInputChange(event.target.value);
                    }}
                    className='border-border bg-background h-9 w-full max-w-sm rounded-md border px-2 text-sm'
                    autoComplete='off'
                    placeholder='Title AI model id (for example openai/gpt-5-mini)…'
                />
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isSavingThreadTitlePreference || threadTitleAiModelInput.trim().length === 0}
                    onClick={onSaveThreadTitleAiModel}>
                    Save AI Model
                </Button>
            </div>
        </section>
    );
}
