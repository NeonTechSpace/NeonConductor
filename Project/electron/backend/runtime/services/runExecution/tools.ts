import { toolStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeToolDefinition } from '@/app/backend/providers/types';
import { mcpService } from '@/app/backend/runtime/services/mcp/service';
import {
    modeAllowsToolCapabilities,
    modeRequiresNativeTools,
} from '@/app/backend/runtime/services/mode/toolCapabilities';

import type { ModeDefinition } from '@/shared/contracts';

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

export function runModeRequiresNativeTools(input: { mode: ModeDefinition }): boolean {
    return modeRequiresNativeTools(input.mode);
}

export async function resolveRuntimeToolsForMode(input: {
    mode: ModeDefinition;
}): Promise<ProviderRuntimeToolDefinition[]> {
    if (!modeRequiresNativeTools(input.mode)) {
        return [];
    }

    const storedTools = await toolStore.list();
    const nativeTools = storedTools
        .filter((tool) => modeAllowsToolCapabilities(input.mode, tool.capabilities))
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

    const mcpTools = modeAllowsToolCapabilities(input.mode, ['mcp']) ? await mcpService.listRuntimeTools() : [];
    return [...nativeTools, ...mcpTools];
}

