import type { TopLevelTab } from '@/shared/contracts';

const TAB_OPTIONS: Array<{ id: TopLevelTab; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'agent', label: 'Agent' },
    { id: 'orchestrator', label: 'Orchestrator' },
];

interface WorkspaceSurfaceHeaderProps {
    profiles: Array<{ id: string; name: string }>;
    resolvedProfileId: string | undefined;
    topLevelTab: TopLevelTab;
    isSwitchingProfile: boolean;
    onTopLevelTabChange: (topLevelTab: TopLevelTab) => void;
    onPreviewTopLevelTab?: (topLevelTab: TopLevelTab) => void;
    onProfileChange: (profileId: string) => void;
    onOpenSettings: () => void;
}

export function WorkspaceSurfaceHeader({
    profiles,
    resolvedProfileId,
    topLevelTab,
    isSwitchingProfile,
    onTopLevelTabChange,
    onPreviewTopLevelTab,
    onProfileChange,
    onOpenSettings,
}: WorkspaceSurfaceHeaderProps) {
    return (
        <header className='border-border/80 bg-background/85 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur-sm'>
            <div className='flex items-center gap-2'>
                {TAB_OPTIONS.map((tab) => (
                    <button
                        key={tab.id}
                        type='button'
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                            tab.id === topLevelTab
                                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                : 'border-border bg-card/80 hover:bg-accent'
                        }`}
                        onMouseEnter={() => {
                            onPreviewTopLevelTab?.(tab.id);
                        }}
                        onFocus={() => {
                            onPreviewTopLevelTab?.(tab.id);
                        }}
                        onClick={() => {
                            onTopLevelTabChange(tab.id);
                        }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className='flex flex-wrap items-center gap-2'>
                <span className='text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase'>Profile</span>
                <select
                    className='border-border bg-card h-9 min-w-[220px] rounded-full border px-3 text-sm'
                    value={resolvedProfileId ?? ''}
                    disabled={!resolvedProfileId || isSwitchingProfile}
                    onChange={(event) => {
                        onProfileChange(event.target.value.trim());
                    }}>
                    {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                            {profile.name}
                        </option>
                    ))}
                </select>

                <button
                    type='button'
                    className='border-border bg-card hover:bg-accent rounded-full border px-3 py-1.5 text-sm font-medium'
                    onClick={onOpenSettings}>
                    Settings
                </button>
            </div>
        </header>
    );
}

