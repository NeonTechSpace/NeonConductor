import type { ToolRecord } from '@/app/backend/persistence/types';

const TOOL_SAFETY_METADATA: Record<
    string,
    Pick<ToolRecord, 'capabilities' | 'requiresWorkspace' | 'allowsExternalPaths' | 'allowsIgnoredPaths'>
> = {
    read_file: {
        capabilities: ['filesystem_read'],
        requiresWorkspace: true,
        allowsExternalPaths: false,
        allowsIgnoredPaths: false,
    },
    list_files: {
        capabilities: ['filesystem_read'],
        requiresWorkspace: true,
        allowsExternalPaths: false,
        allowsIgnoredPaths: false,
    },
    run_command: {
        capabilities: ['shell'],
        requiresWorkspace: true,
        allowsExternalPaths: false,
        allowsIgnoredPaths: false,
    },
};

export function getToolSafetyMetadata(
    toolId: string
): Pick<ToolRecord, 'capabilities' | 'requiresWorkspace' | 'allowsExternalPaths' | 'allowsIgnoredPaths'> {
    return (
        TOOL_SAFETY_METADATA[toolId] ?? {
            capabilities: [],
            requiresWorkspace: false,
            allowsExternalPaths: false,
            allowsIgnoredPaths: false,
        }
    );
}
