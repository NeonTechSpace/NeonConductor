export interface BuiltInNativeToolDefinition {
    id: 'list_files' | 'read_file' | 'search_files' | 'write_file' | 'run_command' | 'execute_code';
    label: string;
    defaultDescription: string;
    permissionPolicy: 'ask' | 'allow' | 'deny';
    mutability: 'read_only' | 'mutating';
}

export const builtInNativeToolDefinitions: BuiltInNativeToolDefinition[] = [
    {
        id: 'list_files',
        label: 'List Files',
        defaultDescription: 'List files and folders in the active workspace.',
        permissionPolicy: 'ask',
        mutability: 'read_only',
    },
    {
        id: 'read_file',
        label: 'Read File',
        defaultDescription: 'Read file contents from the active workspace.',
        permissionPolicy: 'ask',
        mutability: 'read_only',
    },
    {
        id: 'search_files',
        label: 'Search Files',
        defaultDescription: 'Search for fixed text in workspace files.',
        permissionPolicy: 'ask',
        mutability: 'read_only',
    },
    {
        id: 'write_file',
        label: 'Write File',
        defaultDescription: 'Create or replace a UTF-8 text file in the active workspace.',
        permissionPolicy: 'ask',
        mutability: 'mutating',
    },
    {
        id: 'run_command',
        label: 'Run Command',
        defaultDescription: 'Run a command in the resolved execution target under tool policy and approval.',
        permissionPolicy: 'ask',
        mutability: 'mutating',
    },
    {
        id: 'execute_code',
        label: 'Execute Code',
        defaultDescription: 'Run an approved JavaScript transform in the vendored Node runtime.',
        permissionPolicy: 'ask',
        mutability: 'mutating',
    },
] as const;

const builtInNativeToolDefinitionById = new Map(
    builtInNativeToolDefinitions.map((definition) => [definition.id, definition] as const)
);

export const builtInNativeToolOrder = builtInNativeToolDefinitions.map((definition) => definition.id);

export function getBuiltInNativeToolDefinition(toolId: string): BuiltInNativeToolDefinition | undefined {
    return builtInNativeToolDefinitionById.get(toolId as BuiltInNativeToolDefinition['id']);
}

export function isBuiltInNativeToolId(toolId: string): toolId is BuiltInNativeToolDefinition['id'] {
    return builtInNativeToolDefinitionById.has(toolId as BuiltInNativeToolDefinition['id']);
}
