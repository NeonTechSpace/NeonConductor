import type { WorkspaceAppSection } from '@/web/components/runtime/workspaceSurfaceModel';

import type { WorkspaceIconSummary, WorkbenchCommandId } from '@/shared/contracts';

export type WorkbenchPaletteCommand =
    | {
          id: string;
          commandId: Extract<WorkbenchCommandId, 'go_sessions' | 'open_settings'>;
          label: string;
          meta: string;
          onSelect: () => void;
          onPreview?: () => void;
      }
    | {
          id: string;
          label: string;
          meta: string;
          onSelect: () => void | Promise<void>;
          onPreview?: () => void;
      }
    | {
          id: string;
          label: string;
          meta: string;
          workspace: { fingerprint: string; label: string; workspaceIconSummary?: WorkspaceIconSummary };
          onSelect: () => void;
          onPreview?: () => void;
      };

export function buildWorkbenchPaletteCommands(input: {
    appSection: WorkspaceAppSection;
    profiles: Array<{ id: string; name: string }>;
    workspaceOptions: Array<{ fingerprint: string; label: string; workspaceIconSummary?: WorkspaceIconSummary }>;
    onCommand: (commandId: WorkbenchCommandId) => void;
    onPreviewSectionChange?: (section: WorkspaceAppSection) => void;
    onProfileChange: (profileId: string) => void;
    onWorkspaceChange: (workspaceFingerprint: string | undefined) => void;
}): WorkbenchPaletteCommand[] {
    const goSessionsCommand: WorkbenchPaletteCommand = {
        id: 'command:go_sessions',
        commandId: 'go_sessions',
        label: 'Go to Sessions',
        meta: input.appSection === 'sessions' ? 'Current section' : 'Application section',
        onSelect: () => {
            input.onCommand('go_sessions');
        },
    };
    const openSettingsCommand: WorkbenchPaletteCommand = {
        id: 'command:open_settings',
        commandId: 'open_settings',
        label: 'Open Settings',
        meta: input.appSection === 'settings' ? 'Current section' : 'Application section',
        onSelect: () => {
            input.onCommand('open_settings');
        },
    };

    if (input.onPreviewSectionChange) {
        goSessionsCommand.onPreview = () => {
            input.onPreviewSectionChange?.('sessions');
        };
        openSettingsCommand.onPreview = () => {
            input.onPreviewSectionChange?.('settings');
        };
    }

    const sectionCommands: WorkbenchPaletteCommand[] = [goSessionsCommand, openSettingsCommand];

    return [
        ...sectionCommands,
        ...input.profiles.map((profile) => ({
            id: `profile:${profile.id}`,
            label: `Switch profile: ${profile.name}`,
            meta: profile.id,
            onSelect: () => {
                input.onProfileChange(profile.id);
            },
        })),
        ...input.workspaceOptions.map((workspace) => ({
            id: `workspace:${workspace.fingerprint}`,
            label: `Focus workspace: ${workspace.label}`,
            meta: workspace.fingerprint,
            workspace,
            onSelect: () => {
                input.onWorkspaceChange(workspace.fingerprint);
            },
        })),
    ];
}

export function filterWorkbenchPaletteCommands(
    commands: WorkbenchPaletteCommand[],
    query: string
): WorkbenchPaletteCommand[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return commands;
    }

    return commands.filter((command) =>
        [command.label, command.meta].some((value) => value.toLowerCase().includes(normalizedQuery))
    );
}
