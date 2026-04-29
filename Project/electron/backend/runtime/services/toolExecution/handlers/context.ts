import type { FileToolExecutionRootAuthority } from '@/app/backend/runtime/services/toolExecution/safety';

export interface ToolHandlerExecutionContext {
    profileId?: string;
    executionRoot?: FileToolExecutionRootAuthority;
    cwd?: string;
    signal?: AbortSignal;
}

export function requireFileToolExecutionRoot(
    context: ToolHandlerExecutionContext | undefined
): FileToolExecutionRootAuthority | null {
    return context?.executionRoot ?? null;
}
