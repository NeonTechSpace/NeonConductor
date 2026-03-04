import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';
import { trpc } from '@/web/trpc/client';

interface ProfileSettingsViewProps {
    activeProfileId: string;
    onProfileActivated: (profileId: string) => void;
}

export function ProfileSettingsView({ activeProfileId, onProfileActivated }: ProfileSettingsViewProps) {
    const profilesQuery = trpc.profile.list.useQuery(undefined, { refetchOnWindowFocus: false });
    const createMutation = trpc.profile.create.useMutation();
    const renameMutation = trpc.profile.rename.useMutation();
    const duplicateMutation = trpc.profile.duplicate.useMutation();
    const deleteMutation = trpc.profile.delete.useMutation();
    const setActiveMutation = trpc.profile.setActive.useMutation();

    const profiles = profilesQuery.data?.profiles ?? [];

    const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);
    const [newProfileName, setNewProfileName] = useState('');
    const [renameValue, setRenameValue] = useState('');
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    useEffect(() => {
        if (profiles.length === 0) {
            setSelectedProfileId(undefined);
            return;
        }

        if (selectedProfileId && profiles.some((profile) => profile.id === selectedProfileId)) {
            return;
        }

        if (profiles.some((profile) => profile.id === activeProfileId)) {
            setSelectedProfileId(activeProfileId);
            return;
        }

        setSelectedProfileId(profiles[0]?.id);
    }, [activeProfileId, profiles, selectedProfileId]);

    const selectedProfile = useMemo(
        () => profiles.find((profile) => profile.id === selectedProfileId),
        [profiles, selectedProfileId]
    );

    useEffect(() => {
        setRenameValue(selectedProfile?.name ?? '');
    }, [selectedProfile?.id, selectedProfile?.name]);

    const cannotDeleteLastProfile = profiles.length <= 1;

    return (
        <section className='grid min-h-full grid-cols-[280px_1fr]'>
            <aside className='border-border bg-background/40 min-h-0 overflow-y-auto border-r p-3'>
                <p className='text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase'>Profiles</p>
                <div className='space-y-2'>
                    {profiles.map((profile) => (
                        <button
                            key={profile.id}
                            type='button'
                            className={`w-full rounded-md border px-2 py-2 text-left ${
                                profile.id === selectedProfileId
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border bg-card hover:bg-accent'
                            }`}
                            onClick={() => {
                                setSelectedProfileId(profile.id);
                                setStatusMessage(undefined);
                            }}>
                            <p className='text-sm font-medium'>
                                {profile.name}{' '}
                                {profile.id === activeProfileId ? (
                                    <span className='text-primary text-xs'>(active)</span>
                                ) : null}
                            </p>
                            <p className='text-muted-foreground truncate text-[11px]'>{profile.id}</p>
                        </button>
                    ))}
                </div>
            </aside>

            <div className='min-h-0 overflow-y-auto p-4'>
                <div className='space-y-5'>
                    <section className='space-y-2'>
                        <p className='text-sm font-semibold'>Create Profile</p>
                        <div className='grid grid-cols-[1fr_auto] gap-2'>
                            <input
                                type='text'
                                value={newProfileName}
                                onChange={(event) => {
                                    setNewProfileName(event.target.value);
                                }}
                                className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                                placeholder='New profile name (optional)'
                            />
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={createMutation.isPending}
                                onClick={() => {
                                    void createMutation
                                        .mutateAsync({
                                            ...(newProfileName.trim() ? { name: newProfileName.trim() } : {}),
                                        })
                                        .then((result) => {
                                            setStatusMessage(`Created profile "${result.profile.name}".`);
                                            setNewProfileName('');
                                            setSelectedProfileId(result.profile.id);
                                            void profilesQuery.refetch();
                                        });
                                }}>
                                Create
                            </Button>
                        </div>
                    </section>

                    {selectedProfile ? (
                        <section className='space-y-3'>
                            <p className='text-sm font-semibold'>Selected Profile</p>
                            <div className='grid grid-cols-[1fr_auto_auto] gap-2'>
                                <input
                                    type='text'
                                    value={renameValue}
                                    onChange={(event) => {
                                        setRenameValue(event.target.value);
                                    }}
                                    className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                                    placeholder='Profile name'
                                />
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={
                                        renameMutation.isPending ||
                                        renameValue.trim().length === 0 ||
                                        renameValue.trim() === selectedProfile.name
                                    }
                                    onClick={() => {
                                        void renameMutation
                                            .mutateAsync({
                                                profileId: selectedProfile.id,
                                                name: renameValue.trim(),
                                            })
                                            .then((result) => {
                                                if (!result.updated) {
                                                    setStatusMessage('Rename failed: profile not found.');
                                                    return;
                                                }

                                                setStatusMessage(`Renamed profile to "${result.profile.name}".`);
                                                void profilesQuery.refetch();
                                            });
                                    }}>
                                    Rename
                                </Button>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={duplicateMutation.isPending}
                                    onClick={() => {
                                        void duplicateMutation
                                            .mutateAsync({
                                                profileId: selectedProfile.id,
                                            })
                                            .then((result) => {
                                                if (!result.duplicated) {
                                                    setStatusMessage('Duplicate failed: profile not found.');
                                                    return;
                                                }

                                                setStatusMessage(`Duplicated as "${result.profile.name}".`);
                                                setSelectedProfileId(result.profile.id);
                                                void profilesQuery.refetch();
                                            });
                                    }}>
                                    Duplicate
                                </Button>
                            </div>

                            <div className='flex flex-wrap items-center gap-2'>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={setActiveMutation.isPending || selectedProfile.id === activeProfileId}
                                    onClick={() => {
                                        void setActiveMutation
                                            .mutateAsync({
                                                profileId: selectedProfile.id,
                                            })
                                            .then((result) => {
                                                if (!result.updated) {
                                                    setStatusMessage('Set active failed: profile not found.');
                                                    return;
                                                }

                                                setStatusMessage(`Active profile set to "${result.profile.name}".`);
                                                onProfileActivated(result.profile.id);
                                                void profilesQuery.refetch();
                                            });
                                    }}>
                                    {selectedProfile.id === activeProfileId ? 'Active' : 'Set Active'}
                                </Button>

                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={cannotDeleteLastProfile || deleteMutation.isPending}
                                    onClick={() => {
                                        setConfirmDeleteOpen(true);
                                    }}>
                                    Delete
                                </Button>
                                <span className='text-muted-foreground text-xs'>
                                    {cannotDeleteLastProfile
                                        ? 'Cannot delete the last remaining profile.'
                                        : 'Deletion removes local profile-scoped data.'}
                                </span>
                            </div>
                        </section>
                    ) : null}

                    {statusMessage ? <p className='text-primary text-xs'>{statusMessage}</p> : null}
                </div>
            </div>

            <ConfirmDialog
                open={confirmDeleteOpen}
                title='Delete Profile'
                message='Delete this profile and all local profile-scoped runtime data? This cannot be undone.'
                confirmLabel='Delete profile'
                destructive
                busy={deleteMutation.isPending}
                onCancel={() => {
                    setConfirmDeleteOpen(false);
                }}
                onConfirm={() => {
                    if (!selectedProfile) {
                        setConfirmDeleteOpen(false);
                        return;
                    }

                    void deleteMutation
                        .mutateAsync({
                            profileId: selectedProfile.id,
                        })
                        .then((result) => {
                            setConfirmDeleteOpen(false);
                            if (!result.deleted) {
                                setStatusMessage(
                                    result.reason === 'last_profile'
                                        ? 'Cannot delete the last remaining profile.'
                                        : 'Delete failed: profile not found.'
                                );
                                return;
                            }

                            setStatusMessage('Profile deleted.');
                            if (result.activeProfileId) {
                                onProfileActivated(result.activeProfileId);
                            }
                            setSelectedProfileId(undefined);
                            void profilesQuery.refetch();
                        });
                }}
            />
        </section>
    );
}
