import { Settings2 } from 'lucide-react';
import { useId } from 'react';

import type { WorkspaceAppSection } from '@/web/components/runtime/workspaceSurfaceModel';
import PrivacyModeToggle from '@/web/components/window/privacyModeToggle';

interface WorkspaceSurfaceHeaderProps {
    appSection: WorkspaceAppSection;
    profiles: Array<{ id: string; name: string }>;
    resolvedProfileId: string | undefined;
    isSwitchingProfile: boolean;
    onProfileChange: (profileId: string) => void;
    onOpenSettings: () => void;
    onPreviewSettings?: () => void;
    onOpenCommandPalette: () => void;
}

export function WorkspaceSurfaceHeader({
    appSection,
    profiles,
    resolvedProfileId,
    isSwitchingProfile,
    onProfileChange,
    onOpenSettings,
    onPreviewSettings,
    onOpenCommandPalette,
}: WorkspaceSurfaceHeaderProps) {
    const isSettingsOpen = appSection === 'settings';
    const profileSelectId = useId();

    return (
        <header className='border-border/80 bg-background/90 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur-sm'>
            <div className='flex min-w-0 items-center gap-3'>
                <div className='min-w-0 space-y-1'>
                    <p className='text-[11px] font-semibold tracking-[0.14em] uppercase'>NeonConductor</p>
                    <p className='text-muted-foreground text-xs'>
                        {isSettingsOpen ? 'Settings inside the main shell' : 'Sessions, threads, and runs in one shell'}
                    </p>
                </div>
            </div>

            <div className='flex min-w-0 flex-wrap items-center justify-end gap-2'>
                <label
                    className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'
                    htmlFor={profileSelectId}>
                    <span className='sr-only'>Profile</span>
                    <select
                        id={profileSelectId}
                        className='border-border bg-card h-11 min-w-[200px] rounded-full border px-3 text-sm'
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
                </label>

                <button
                    type='button'
                    aria-label='Open command palette'
                    className='border-border bg-card hover:bg-accent min-h-11 rounded-full border px-3 py-1.5 text-sm font-medium'
                    onClick={onOpenCommandPalette}>
                    Search · Cmd/Ctrl+K
                </button>

                <button
                    type='button'
                    aria-label='Open settings'
                    title='Open settings'
                    className={`border-border inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
                        isSettingsOpen
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'bg-card hover:bg-accent text-foreground'
                    }`}
                    disabled={isSettingsOpen}
                    onPointerEnter={onPreviewSettings}
                    onFocus={onPreviewSettings}
                    onClick={onOpenSettings}>
                    <Settings2 className='h-4 w-4' />
                </button>

                <PrivacyModeToggle />
            </div>
        </header>
    );
}
