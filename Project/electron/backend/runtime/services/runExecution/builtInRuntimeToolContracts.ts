import type { ProviderRuntimeToolDefinition } from '@/app/backend/providers/types';

export type BuiltInRuntimeToolContractId =
    | 'list_files'
    | 'read_file'
    | 'search_files'
    | 'write_file'
    | 'run_command'
    | 'execute_code';

export type BuiltInRuntimeToolDescriptionKind =
    | 'default'
    | 'search_files'
    | 'write_file'
    | 'run_command'
    | 'execute_code';

export interface BuiltInRuntimeToolContract {
    id: BuiltInRuntimeToolContractId;
    inputSchema: ProviderRuntimeToolDefinition['inputSchema'];
    exposureOrder: number;
    descriptionKind: BuiltInRuntimeToolDescriptionKind;
    implemented: boolean;
}

export const builtInRuntimeToolContracts: BuiltInRuntimeToolContract[] = [
    {
        id: 'list_files',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                path: {
                    type: 'string',
                    description: 'Absolute or workspace-relative directory path to inspect.',
                },
                includeHidden: {
                    type: 'boolean',
                    description: 'Whether to include dotfiles and hidden directories.',
                },
                recursive: {
                    type: 'boolean',
                    description: 'Whether to recurse into subdirectories.',
                },
                maxEntries: {
                    type: 'number',
                    description: 'Maximum number of files and directories to return.',
                },
            },
        },
        exposureOrder: 0,
        descriptionKind: 'default',
        implemented: true,
    },
    {
        id: 'read_file',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                path: {
                    type: 'string',
                    description: 'Absolute or workspace-relative file path to read.',
                },
                maxBytes: {
                    type: 'number',
                    description: 'Maximum number of bytes to read before truncating the content.',
                },
            },
            required: ['path'],
        },
        exposureOrder: 1,
        descriptionKind: 'default',
        implemented: true,
    },
    {
        id: 'search_files',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                query: {
                    type: 'string',
                    description: 'Fixed text to search for in workspace files.',
                },
                path: {
                    type: 'string',
                    description: 'Absolute or workspace-relative file or directory path to search. Defaults to the workspace root.',
                },
                caseSensitive: {
                    type: 'boolean',
                    description: 'Whether the search should be case-sensitive.',
                },
                maxMatches: {
                    type: 'number',
                    description: 'Maximum number of matches to return before truncating results.',
                },
            },
            required: ['query'],
        },
        exposureOrder: 2,
        descriptionKind: 'search_files',
        implemented: true,
    },
    {
        id: 'write_file',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                path: {
                    type: 'string',
                    description: 'Absolute or workspace-relative file path to create or replace.',
                },
                content: {
                    type: 'string',
                    description: 'Full UTF-8 text content to write.',
                },
                overwrite: {
                    type: 'boolean',
                    description: 'Whether to replace an existing file. Defaults to false.',
                },
            },
            required: ['path', 'content'],
        },
        exposureOrder: 3,
        descriptionKind: 'write_file',
        implemented: true,
    },
    {
        id: 'run_command',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                command: {
                    type: 'string',
                    description: 'Shell command to execute inside the active workspace root.',
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Optional timeout override in milliseconds.',
                },
            },
            required: ['command'],
        },
        exposureOrder: 4,
        descriptionKind: 'run_command',
        implemented: true,
    },
    {
        id: 'execute_code',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                code: {
                    type: 'string',
                    description: 'JavaScript or TypeScript-oriented source for the vendored Node runtime.',
                },
                timeoutMs: {
                    type: 'number',
                    description: 'Optional timeout override in milliseconds.',
                },
            },
            required: ['code'],
        },
        exposureOrder: 5,
        descriptionKind: 'execute_code',
        implemented: false,
    },
] as const;

const builtInRuntimeToolContractById = new Map(
    builtInRuntimeToolContracts.map((contract) => [contract.id, contract] as const)
);

export function getBuiltInRuntimeToolContract(toolId: string): BuiltInRuntimeToolContract | undefined {
    return builtInRuntimeToolContractById.get(toolId as BuiltInRuntimeToolContractId);
}
