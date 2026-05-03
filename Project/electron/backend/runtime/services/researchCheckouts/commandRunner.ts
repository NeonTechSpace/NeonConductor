import { spawn } from 'node:child_process';

export interface ResearchCheckoutCommandResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}

export interface ResearchCheckoutCommandRunner {
    run(input: {
        command: 'git' | 'jj';
        args: string[];
        cwd: string;
        timeoutMs: number;
    }): Promise<ResearchCheckoutCommandResult>;
}

function redactCommandOutput(input: string): string {
    return input.replace(/:\/\/[^/\s:@]+:[^/\s@]+@/gu, '://<redacted>@');
}

export const defaultResearchCheckoutCommandRunner: ResearchCheckoutCommandRunner = {
    run: (input) =>
        new Promise<ResearchCheckoutCommandResult>((resolve) => {
            const child = spawn(input.command, input.args, {
                cwd: input.cwd,
                shell: false,
                windowsHide: true,
            });
            let stdout = '';
            let stderr = '';
            let settled = false;
            const timeout = setTimeout(() => {
                settled = true;
                child.kill();
                resolve({
                    exitCode: null,
                    stdout: redactCommandOutput(stdout),
                    stderr: redactCommandOutput(stderr),
                    timedOut: true,
                });
            }, input.timeoutMs);

            child.stdout.on('data', (chunk: Buffer) => {
                stdout += chunk.toString('utf8');
            });
            child.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString('utf8');
            });
            child.on('error', (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                resolve({
                    exitCode: null,
                    stdout: redactCommandOutput(stdout),
                    stderr: redactCommandOutput(error.message),
                    timedOut: false,
                });
            });
            child.on('close', (exitCode) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout);
                resolve({
                    exitCode,
                    stdout: redactCommandOutput(stdout),
                    stderr: redactCommandOutput(stderr),
                    timedOut: false,
                });
            });
        }),
};
