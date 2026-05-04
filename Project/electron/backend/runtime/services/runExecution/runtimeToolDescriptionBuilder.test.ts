import { describe, expect, it } from 'vitest';

import { composeRuntimeToolDescription } from '@/app/backend/runtime/services/runExecution/runtimeToolDescriptionBuilder';
import type { RuntimeToolGuidanceContext } from '@/app/backend/runtime/services/runExecution/types';

function buildGuidanceContext(overrides: Partial<RuntimeToolGuidanceContext> = {}): RuntimeToolGuidanceContext {
    return {
        platform: 'win32',
        shellFamily: 'powershell',
        shellExecutable: 'pwsh.exe',
        shellResolved: true,
        vendoredRipgrepAvailable: true,
        sandboxPolicySummary: {
            filesystem: {
                kind: 'local_workspace',
                effectiveRootLabel: 'Workspace',
                effectiveRootPath: 'C:\\Repo',
                writable: true,
                managedByNeon: false,
                failClosedOnMissingTarget: false,
            },
            network: {
                kind: 'not_restricted',
                restricted: false,
                reviewRequired: false,
                blockedNetworkVisible: false,
                reason: 'Network is not restricted.',
            },
            process: {
                state: 'unsupported',
                platform: 'win32',
                mechanism: 'managed_directory',
                nativeEnforcement: false,
                reason: 'Native process sandbox helpers are future work.',
            },
            diagnostics: [],
        },
        ...overrides,
    };
}

describe('runtimeToolDescriptionBuilder', () => {
    it('adds shell-aware guidance to run_command descriptions', () => {
        const description = composeRuntimeToolDescription({
            toolId: 'run_command',
            baseDescription: 'Run a command in a sandboxed shell.',
            guidanceContext: buildGuidanceContext(),
        });

        expect(description).toContain('PowerShell 7 via pwsh.exe');
        expect(description).toContain('Effective filesystem policy: local workspace at C:\\Repo.');
        expect(description).toContain('Network policy: not restricted. Network is not restricted.');
        expect(description).toContain('Process sandbox capability: unsupported; native enforcement not enabled.');
        expect(description).toContain('search_files tool');
        expect(description).toContain('rg "TODO"');
        expect(description).toContain('Get-Content path');
    });

    it('switches to cmd examples when Command Prompt fallback is active', () => {
        const description = composeRuntimeToolDescription({
            toolId: 'run_command',
            baseDescription: 'Run a command in a sandboxed shell.',
            guidanceContext: buildGuidanceContext({
                shellFamily: 'cmd',
                shellExecutable: 'cmd.exe',
            }),
        });

        expect(description).toContain('Command Prompt');
        expect(description).toContain('cmd.exe');
        expect(description).toContain('findstr /s /n /i "TODO" *');
        expect(description).toContain('dir /s /b *.ts');
    });

    it('marks search_files as the preferred ordinary search tool', () => {
        const description = composeRuntimeToolDescription({
            toolId: 'search_files',
            baseDescription: 'Search for fixed text in workspace files.',
            guidanceContext: buildGuidanceContext(),
        });

        expect(description).toContain('Prefer this tool for ordinary workspace fixed-text search.');
    });

    it('marks write_file as the preferred whole-file write path', () => {
        const description = composeRuntimeToolDescription({
            toolId: 'write_file',
            baseDescription: 'Create or replace a UTF-8 text file in the active workspace.',
            guidanceContext: buildGuidanceContext(),
        });

        expect(description).toContain(
            'Prefer this tool for ordinary whole-file creation or replacement inside the workspace.'
        );
        expect(description).toContain('overwrite: true');
        expect(description).toContain('run_command only when shell behavior is specifically needed');
    });

    it('formats transform-only execute_code guidance', () => {
        const description = composeRuntimeToolDescription({
            descriptionKind: 'execute_code',
            baseDescription: 'Execute code in the vendored runtime.',
            guidanceContext: buildGuidanceContext(),
        });

        expect(description).toContain('JavaScript async function body');
        expect(description).toContain('bounded transform logic');
        expect(description).toContain('does not expose a filesystem');
        expect(description).toContain('Use read_file, search_files, write_file, and run_command');
    });
});
