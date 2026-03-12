import { toolStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeToolDefinition } from '@/app/backend/providers/types';
import type { ModeDefinition, TopLevelTab } from '@/app/backend/runtime/contracts';

const TOOL_INPUT_SCHEMAS: Record<string, ProviderRuntimeToolDefinition['inputSchema']> = {
    list_files: {
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
    read_file: {
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
    run_command: {
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
};

function modeCanUseNativeTools(input: {
    topLevelTab: TopLevelTab;
    mode: ModeDefinition;
}): boolean {
    if (input.mode.executionPolicy.planningOnly) {
        return false;
    }

    if (input.topLevelTab === 'chat') {
        return false;
    }

    if (input.topLevelTab === 'agent') {
        return input.mode.executionPolicy.readOnly !== true;
    }

    return true;
}

export function runModeRequiresNativeTools(input: {
    topLevelTab: TopLevelTab;
    mode: ModeDefinition;
}): boolean {
    return modeCanUseNativeTools(input);
}

export async function resolveRuntimeToolsForMode(input: {
    topLevelTab: TopLevelTab;
    mode: ModeDefinition;
}): Promise<ProviderRuntimeToolDefinition[]> {
    if (!modeCanUseNativeTools(input)) {
        return [];
    }

    const storedTools = await toolStore.list();
    return storedTools
        .map((tool) => {
            const inputSchema = TOOL_INPUT_SCHEMAS[tool.id];
            if (!inputSchema) {
                return null;
            }

            return {
                id: tool.id,
                description: tool.description,
                inputSchema,
            } satisfies ProviderRuntimeToolDefinition;
        })
        .filter((tool): tool is ProviderRuntimeToolDefinition => tool !== null);
}
