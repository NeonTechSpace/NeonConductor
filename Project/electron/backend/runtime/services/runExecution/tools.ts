import { toolStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeToolDefinition } from '@/app/backend/providers/types';
import { mcpService } from '@/app/backend/runtime/services/mcp/service';
import { modeUsesReadOnlyExecution } from '@/app/backend/runtime/services/mode/metadata';
import {
    getModeToolCapabilities,
    modeAllowsToolCapabilities,
    modeRequiresNativeTools,
} from '@/app/backend/runtime/services/mode/toolCapabilities';
import { composeRuntimeToolDescription } from '@/app/backend/runtime/services/runExecution/runtimeToolDescriptionBuilder';
import type { RuntimeToolGuidanceContext } from '@/app/backend/runtime/services/runExecution/types';
import { builtInNativeToolOrder } from '@/app/backend/runtime/services/toolExecution/builtInNativeTools';

import type { ModeDefinition, ToolMutability } from '@/shared/contracts';

type RuntimeExposedToolDefinition = ProviderRuntimeToolDefinition & { mutability: ToolMutability };

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
    search_files: {
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
    write_file: {
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
    guidanceContext?: RuntimeToolGuidanceContext;
}): Promise<ProviderRuntimeToolDefinition[]> {
    if (getModeToolCapabilities(input.mode.executionPolicy).length === 0) {
        return [];
    }

    const storedTools = await toolStore.list();
    const nativeTools = storedTools
        .filter((tool) => modeAllowsToolCapabilities(input.mode, tool.capabilities))
        .filter((tool) => !modeUsesReadOnlyExecution(input.mode) || tool.mutability === 'read_only')
        .sort((left, right) => {
            const leftIndex = builtInNativeToolOrder.indexOf(left.id as (typeof builtInNativeToolOrder)[number]);
            const rightIndex = builtInNativeToolOrder.indexOf(right.id as (typeof builtInNativeToolOrder)[number]);
            const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
            const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
            return normalizedLeftIndex - normalizedRightIndex || left.label.localeCompare(right.label);
        })
        .map((tool) => {
            const inputSchema = TOOL_INPUT_SCHEMAS[tool.id];
            if (!inputSchema) {
                return null;
            }

            return {
                id: tool.id,
                description: composeRuntimeToolDescription({
                    toolId: tool.id,
                    baseDescription: tool.description,
                    ...(input.guidanceContext ? { guidanceContext: input.guidanceContext } : {}),
                }),
                inputSchema,
                mutability: tool.mutability,
            } satisfies RuntimeExposedToolDefinition;
        })
        .filter((tool): tool is RuntimeExposedToolDefinition => tool !== null);

    const mcpTools = modeAllowsToolCapabilities(input.mode, ['mcp'])
        ? (await mcpService.listRuntimeTools()).filter((tool) => !modeUsesReadOnlyExecution(input.mode) || tool.mutability === 'read_only')
        : [];
    return [...nativeTools, ...mcpTools];
}

