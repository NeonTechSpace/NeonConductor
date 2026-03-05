import { useEffect, useMemo, useState } from 'react';

import { ConversationShell } from '@/web/components/conversation/shell';
import { SettingsSheet } from '@/web/components/settings/settingsSheet';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/app/backend/runtime/contracts';

const TAB_OPTIONS: Array<{ id: TopLevelTab; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'agent', label: 'Agent' },
    { id: 'orchestrator', label: 'Orchestrator' },
];

const FALLBACK_MODE_BY_TAB: Record<TopLevelTab, string> = {
    chat: 'chat',
    agent: 'code',
    orchestrator: 'plan',
};

const MISSING_PROFILE_ID = 'profile_missing';

export function WorkspaceSurface() {
    const [activeProfileId, setActiveProfileId] = useState<string | undefined>(undefined);
    const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>('chat');
    const [showSettings, setShowSettings] = useState(false);

    const profileListQuery = trpc.profile.list.useQuery(undefined, {
        refetchOnWindowFocus: false,
    });
    const activeProfileQuery = trpc.profile.getActive.useQuery(undefined, {
        refetchOnWindowFocus: false,
    });

    const profiles = profileListQuery.data?.profiles ?? [];

    const resolvedProfileId = useMemo(() => {
        const hasActiveProfile = activeProfileId ? profiles.some((profile) => profile.id === activeProfileId) : false;
        if (hasActiveProfile && activeProfileId) {
            return activeProfileId;
        }

        const serverActiveProfileId = activeProfileQuery.data?.activeProfileId;
        if (serverActiveProfileId && profiles.some((profile) => profile.id === serverActiveProfileId)) {
            return serverActiveProfileId;
        }

        const flaggedActiveProfileId = profiles.find((profile) => profile.isActive)?.id;
        if (flaggedActiveProfileId) {
            return flaggedActiveProfileId;
        }

        return profiles[0]?.id;
    }, [activeProfileId, activeProfileQuery.data?.activeProfileId, profiles]);

    useEffect(() => {
        if (!resolvedProfileId || resolvedProfileId === activeProfileId) {
            return;
        }

        setActiveProfileId(resolvedProfileId);
    }, [activeProfileId, resolvedProfileId]);

    const profileSetActiveMutation = trpc.profile.setActive.useMutation({
        onSuccess: async (result) => {
            if (!result.updated) {
                return;
            }

            setActiveProfileId(result.profile.id);
            setTopLevelTab('chat');
            await Promise.all([profileListQuery.refetch(), activeProfileQuery.refetch()]);
        },
    });

    const profileIdForMode = resolvedProfileId ?? MISSING_PROFILE_ID;

    const modeListQuery = trpc.mode.list.useQuery(
        {
            profileId: profileIdForMode,
            topLevelTab,
        },
        {
            enabled: Boolean(resolvedProfileId),
            refetchOnWindowFocus: false,
        }
    );
    const modeActiveQuery = trpc.mode.getActive.useQuery(
        {
            profileId: profileIdForMode,
            topLevelTab,
        },
        {
            enabled: Boolean(resolvedProfileId),
            refetchOnWindowFocus: false,
        }
    );
    const setActiveModeMutation = trpc.mode.setActive.useMutation({
        onSuccess: () => {
            void modeListQuery.refetch();
            void modeActiveQuery.refetch();
        },
    });

    const modes = modeActiveQuery.data?.modes ?? modeListQuery.data?.modes ?? [];
    const activeModeKey = modeActiveQuery.data?.activeMode.modeKey ?? FALLBACK_MODE_BY_TAB[topLevelTab];

    return (
        <section className='flex min-h-0 flex-1 flex-col'>
            <header className='border-border bg-card/35 flex items-center justify-between border-b px-3 py-2'>
                <div className='flex items-center gap-2'>
                    {TAB_OPTIONS.map((tab) => (
                        <button
                            key={tab.id}
                            type='button'
                            className={`rounded-md border px-2.5 py-1 text-sm ${
                                tab.id === topLevelTab
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border bg-background hover:bg-accent'
                            }`}
                            onClick={() => {
                                setTopLevelTab(tab.id);
                            }}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className='flex items-center gap-2'>
                    <span className='text-muted-foreground text-xs font-medium'>Profile</span>
                    <select
                        className='border-border bg-background h-8 min-w-[220px] rounded-md border px-2 text-sm'
                        value={resolvedProfileId ?? ''}
                        disabled={!resolvedProfileId || profileSetActiveMutation.isPending}
                        onChange={(event) => {
                            const nextProfileId = event.target.value.trim();
                            if (!nextProfileId || nextProfileId === resolvedProfileId) {
                                return;
                            }

                            void profileSetActiveMutation.mutateAsync({
                                profileId: nextProfileId,
                            });
                        }}>
                        {profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                                {profile.name}
                            </option>
                        ))}
                    </select>

                    <button
                        type='button'
                        className='border-border bg-background hover:bg-accent rounded-md border px-2.5 py-1 text-sm'
                        onClick={() => {
                            setShowSettings(true);
                        }}>
                        Settings
                    </button>
                    <span className='text-muted-foreground text-xs font-medium'>Mode</span>
                    <select
                        className='border-border bg-background h-8 min-w-[180px] rounded-md border px-2 text-sm'
                        value={activeModeKey}
                        disabled={!resolvedProfileId}
                        onChange={(event) => {
                            const nextModeKey = event.target.value.trim();
                            if (!nextModeKey || setActiveModeMutation.isPending || !resolvedProfileId) {
                                return;
                            }

                            void setActiveModeMutation.mutateAsync({
                                profileId: resolvedProfileId,
                                topLevelTab,
                                modeKey: nextModeKey,
                            });
                        }}>
                        {modes.map((mode) => (
                            <option key={mode.id} value={mode.modeKey}>
                                {mode.label}
                            </option>
                        ))}
                    </select>
                </div>
            </header>

            <div className='min-h-0 flex-1'>
                {resolvedProfileId ? (
                    <ConversationShell
                        profileId={resolvedProfileId}
                        topLevelTab={topLevelTab}
                        modeKey={activeModeKey}
                        onTopLevelTabChange={setTopLevelTab}
                    />
                ) : (
                    <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
                        Loading profile state...
                    </div>
                )}
            </div>
            {resolvedProfileId ? (
                <SettingsSheet
                    open={showSettings}
                    profileId={resolvedProfileId}
                    onClose={() => {
                        setShowSettings(false);
                    }}
                    onProfileActivated={(profileId) => {
                        setActiveProfileId(profileId);
                        setTopLevelTab('chat');
                        void profileListQuery.refetch();
                        void activeProfileQuery.refetch();
                    }}
                />
            ) : null}
        </section>
    );
}
