import { err, ok, type Result } from 'neverthrow';
import { Buffer } from 'node:buffer';
import { readFile, stat } from 'node:fs/promises';

import { fileReadGuardService } from '@/app/backend/runtime/services/fileReadGuard/service';
import { readNumberArg, readStringArg } from '@/app/backend/runtime/services/toolExecution/args';
import {
    requireFileToolExecutionRoot,
    type ToolHandlerExecutionContext,
} from '@/app/backend/runtime/services/toolExecution/handlers/context';
import { resolveCanonicalReadToolPath } from '@/app/backend/runtime/services/toolExecution/safety';
import { createReadFileExecutionOutput } from '@/app/backend/runtime/services/toolExecution/toolOutputCompressionPolicy';
import type { ToolExecutionFailure, ToolExecutionOutput } from '@/app/backend/runtime/services/toolExecution/types';

function isMateriallyLossyUtf8Decode(buffer: Buffer, text: string): boolean {
    return Buffer.from(text, 'utf8').compare(buffer) !== 0;
}

export async function readFileToolHandler(
    args: Record<string, unknown>,
    context?: ToolHandlerExecutionContext
): Promise<Result<ToolExecutionOutput, ToolExecutionFailure>> {
    const fileArg = readStringArg(args, 'path');
    if (!fileArg) {
        return err({
            code: 'invalid_args',
            message: 'Missing "path" argument.',
        });
    }

    const executionRoot = requireFileToolExecutionRoot(context);
    if (!executionRoot) {
        return err({
            code: 'execution_failed',
            message: 'Tool "read_file" requires resolved execution-root authority.',
        });
    }

    const targetPathResult = await resolveCanonicalReadToolPath({
        executionRoot,
        targetPath: fileArg,
    });
    if (targetPathResult.isErr()) {
        return err(targetPathResult.error);
    }

    const targetPath = targetPathResult.value.absolutePath;
    const maxBytes = Math.max(1, Math.floor(readNumberArg(args, 'maxBytes', 200_000)));
    try {
        const targetStat = await stat(targetPath);
        if (context?.profileId) {
            const guardResult = await fileReadGuardService.enforceFile({
                profileId: context.profileId,
                fileNameOrPath: targetPath,
                byteSize: targetStat.size,
            });
            if (guardResult.isErr()) {
                return err({
                    code: 'execution_failed',
                    message: guardResult.error.message,
                });
            }
        }

        const buffer = await readFile(targetPath);
        const rawText = buffer.toString('utf8');
        if (isMateriallyLossyUtf8Decode(buffer, rawText)) {
            if (context?.profileId) {
                const invalidUtf8Guard = await fileReadGuardService.enforceFile({
                    profileId: context.profileId,
                    fileNameOrPath: targetPath,
                    byteSize: buffer.byteLength,
                    utf8Valid: false,
                });
                if (invalidUtf8Guard.isErr()) {
                    return err({
                        code: 'execution_failed',
                        message: invalidUtf8Guard.error.message,
                    });
                }
            }
            return err({
                code: 'execution_failed',
                message: 'read_file currently supports UTF-8 text files only.',
            });
        }

        if (context?.profileId) {
            const guardResult = await fileReadGuardService.enforceFile({
                profileId: context.profileId,
                fileNameOrPath: targetPath,
                byteSize: buffer.byteLength,
                utf8Valid: true,
            });
            if (guardResult.isErr()) {
                return err({
                    code: 'execution_failed',
                    message: guardResult.error.message,
                });
            }
        }

        const executionOutput = createReadFileExecutionOutput({
            path: targetPath,
            rawText,
            byteLength: buffer.byteLength,
            requestedPreviewMaxBytes: maxBytes,
        });

        return ok({
            ...executionOutput.output,
            artifactCandidate: executionOutput.artifactCandidate,
        });
    } catch (error) {
        return err({
            code: 'execution_failed',
            message: error instanceof Error ? error.message : String(error),
        });
    }
}
