import {
    createId,
    isDraftValid,
    isWorkingDirectoryMode,
    type McpServerDraft,
} from '@/web/components/settings/appSettings/mcpSection.shared';

export function McpServerEditorSection(input: {
    editorMode: 'create' | 'edit';
    draft: McpServerDraft;
    statusMessage?: string;
    isBusy: boolean;
    onStartCreate: () => void;
    onDraftChange: (updater: (current: McpServerDraft) => McpServerDraft) => void;
    onSubmit: () => Promise<void>;
}) {
    return (
        <section className='border-border/70 bg-card/40 space-y-4 rounded-[24px] border p-5'>
            <div className='flex items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>
                        {input.editorMode === 'create' ? 'Create server' : 'Edit server'}
                    </p>
                    <p className='text-muted-foreground text-xs leading-5'>Env values are write-only after save.</p>
                </div>
                <button
                    type='button'
                    className='border-border/80 rounded-full border px-3 py-1.5 text-xs font-medium'
                    onClick={input.onStartCreate}>
                    New
                </button>
            </div>

            {input.statusMessage ? <p className='text-muted-foreground text-xs'>{input.statusMessage}</p> : null}

            <div className='space-y-3'>
                <input
                    type='text'
                    value={input.draft.label}
                    onChange={(event) => {
                        input.onDraftChange((current) => ({ ...current, label: event.target.value }));
                    }}
                    className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                    placeholder='Label'
                />
                <input
                    type='text'
                    value={input.draft.command}
                    onChange={(event) => {
                        input.onDraftChange((current) => ({ ...current, command: event.target.value }));
                    }}
                    className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                    placeholder='Command'
                />
                <textarea
                    value={input.draft.argsText}
                    onChange={(event) => {
                        input.onDraftChange((current) => ({ ...current, argsText: event.target.value }));
                    }}
                    className='border-border bg-background min-h-24 w-full rounded-md border px-2 py-2 text-sm'
                    placeholder='One argument per line'
                />
                <select
                    value={input.draft.workingDirectoryMode}
                    onChange={(event) => {
                        const nextMode = isWorkingDirectoryMode(event.target.value)
                            ? event.target.value
                            : 'inherit_process';
                        input.onDraftChange((current) => ({
                            ...current,
                            workingDirectoryMode: nextMode,
                            fixedWorkingDirectory: nextMode === 'fixed_path' ? current.fixedWorkingDirectory : '',
                        }));
                    }}
                    className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'>
                    <option value='inherit_process'>Inherit process</option>
                    <option value='workspace_root'>Workspace root</option>
                    <option value='fixed_path'>Fixed path</option>
                </select>
                {input.draft.workingDirectoryMode === 'fixed_path' ? (
                    <input
                        type='text'
                        value={input.draft.fixedWorkingDirectory}
                        onChange={(event) => {
                            input.onDraftChange((current) => ({
                                ...current,
                                fixedWorkingDirectory: event.target.value,
                            }));
                        }}
                        className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                        placeholder='Fixed working directory'
                    />
                ) : null}
                <input
                    type='number'
                    value={input.draft.timeoutText}
                    onChange={(event) => {
                        input.onDraftChange((current) => ({ ...current, timeoutText: event.target.value }));
                    }}
                    className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                    placeholder='Timeout (ms)'
                />
                <label className='flex items-center gap-2 text-sm'>
                    <input
                        type='checkbox'
                        checked={input.draft.enabled}
                        onChange={(event) => {
                            input.onDraftChange((current) => ({ ...current, enabled: event.target.checked }));
                        }}
                    />
                    Enabled
                </label>

                <div className='space-y-2'>
                    <div className='flex items-center justify-between gap-2'>
                        <p className='text-xs font-medium'>Env keys</p>
                        <button
                            type='button'
                            className='border-border/80 rounded-full border px-3 py-1 text-[11px] font-medium'
                            onClick={() => {
                                input.onDraftChange((current) => ({
                                    ...current,
                                    envEntries: [...current.envEntries, { id: createId(), key: '', value: '' }],
                                }));
                            }}>
                            Add key
                        </button>
                    </div>

                    {input.draft.envEntries.map((entry) => (
                        <div key={entry.id} className='grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'>
                            <input
                                type='text'
                                value={entry.key}
                                onChange={(event) => {
                                    input.onDraftChange((current) => ({
                                        ...current,
                                        envEntries: current.envEntries.map((candidate) =>
                                            candidate.id === entry.id
                                                ? { ...candidate, key: event.target.value }
                                                : candidate
                                        ),
                                    }));
                                }}
                                className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                                placeholder='KEY'
                            />
                            <input
                                type='password'
                                value={entry.value}
                                onChange={(event) => {
                                    input.onDraftChange((current) => ({
                                        ...current,
                                        envEntries: current.envEntries.map((candidate) =>
                                            candidate.id === entry.id
                                                ? { ...candidate, value: event.target.value }
                                                : candidate
                                        ),
                                    }));
                                }}
                                className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                                placeholder='Value'
                            />
                            <button
                                type='button'
                                className='border-border/80 rounded-full border px-3 py-1 text-xs font-medium'
                                onClick={() => {
                                    input.onDraftChange((current) => ({
                                        ...current,
                                        envEntries: current.envEntries.filter((candidate) => candidate.id !== entry.id),
                                    }));
                                }}>
                                Remove
                            </button>
                        </div>
                    ))}
                </div>

                <div className='flex justify-end'>
                    <button
                        type='button'
                        className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60'
                        disabled={input.isBusy || !isDraftValid(input.draft)}
                        onClick={() => {
                            void input.onSubmit();
                        }}>
                        {input.editorMode === 'create' ? 'Create server' : 'Save changes'}
                    </button>
                </div>
            </div>
        </section>
    );
}
