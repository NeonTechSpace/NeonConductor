import type { RuntimeToolGuidanceContext } from '@/app/backend/runtime/services/runExecution/types';
import type { BuiltInRuntimeToolDescriptionKind } from '@/app/backend/runtime/services/runExecution/builtInRuntimeToolContracts';

function joinSections(sections: string[]): string {
    return sections.filter((section) => section.trim().length > 0).join('\n\n');
}

function buildRunCommandGuidance(input: {
    guidanceContext: RuntimeToolGuidanceContext;
}): string {
    const shellLabel =
        input.guidanceContext.shellFamily === 'powershell'
            ? input.guidanceContext.shellExecutable === 'pwsh.exe'
                ? 'PowerShell 7 via pwsh.exe'
                : input.guidanceContext.shellExecutable === 'powershell.exe'
                  ? 'legacy Windows PowerShell via powershell.exe'
                  : 'PowerShell'
            : input.guidanceContext.shellFamily === 'cmd'
              ? 'Windows Command Prompt via cmd.exe'
              : '/bin/sh';

    const sections = [
        input.guidanceContext.shellResolved
            ? `This run executes commands through ${shellLabel}. Use shell-native syntax for that shell.`
            : 'This run could not resolve a supported shell executable. Command execution is expected to fail until a supported shell is available.',
        'For ordinary workspace fixed-text search, prefer the native search_files tool before using shell commands.',
    ];

    if (input.guidanceContext.vendoredRipgrepAvailable) {
        sections.push(
            'If shell-based search or file discovery is specifically needed, prefer rg for text search and rg --files for file discovery.'
        );
    }

    if (!input.guidanceContext.shellResolved) {
        return joinSections(sections);
    }

    if (input.guidanceContext.shellFamily === 'powershell') {
        sections.push(
            joinSections([
                'Examples:',
                input.guidanceContext.vendoredRipgrepAvailable ? '`rg "TODO"`' : '',
                input.guidanceContext.vendoredRipgrepAvailable ? '`rg --files`' : '',
                '`Get-ChildItem -Force`',
                '`Get-ChildItem -Recurse -Filter *.ts`',
                '`Get-Content path\\\\to\\\\file`',
                '`Get-ChildItem -Recurse | Select-String -Pattern \'TODO\'`',
            ])
        );
    } else if (input.guidanceContext.shellFamily === 'cmd') {
        sections.push(
            joinSections([
                'Examples:',
                input.guidanceContext.vendoredRipgrepAvailable ? '`rg "TODO"`' : '',
                input.guidanceContext.vendoredRipgrepAvailable ? '`rg --files`' : '',
                '`dir`',
                '`dir /s /b *.ts`',
                '`type path\\\\to\\\\file`',
                '`findstr /s /n /i "TODO" *`',
            ])
        );
    } else {
        sections.push(
            joinSections([
                'Examples:',
                input.guidanceContext.vendoredRipgrepAvailable ? '`rg "TODO"`' : '',
                input.guidanceContext.vendoredRipgrepAvailable ? '`rg --files`' : '',
                '`ls -la`',
                '`find . -name "*.ts"`',
                '`cat path/to/file`',
            ])
        );
    }

    return joinSections(sections);
}

function buildSearchFilesGuidance(): string {
    return 'Prefer this tool for ordinary workspace fixed-text search. Use run_command only when shell behavior is specifically needed.';
}

function buildWriteFileGuidance(): string {
    return joinSections([
        'Prefer this tool for ordinary whole-file creation or replacement inside the workspace.',
        'Set `overwrite: true` only when intentionally replacing an existing file.',
        'Use run_command only when shell behavior is specifically needed or whole-file replacement is the wrong operation.',
    ]);
}

function buildExecuteCodeGuidance(): string {
    return joinSections([
        'This future tool is intended to be the preferred orchestration surface for branching, filtering, retries, transformations, and typed host interaction.',
        'Use run_command only when shell-specific behavior or external tooling is the correct fit.',
    ]);
}

export function composeRuntimeToolDescription(input: {
    descriptionKind?: BuiltInRuntimeToolDescriptionKind;
    toolId?: string;
    baseDescription: string;
    guidanceContext?: RuntimeToolGuidanceContext;
}): string {
    if (!input.guidanceContext) {
        return input.baseDescription;
    }

    const descriptionKind = input.descriptionKind ?? input.toolId ?? 'default';

    if (descriptionKind === 'run_command') {
        return joinSections([input.baseDescription, buildRunCommandGuidance({ guidanceContext: input.guidanceContext })]);
    }

    if (descriptionKind === 'search_files') {
        return joinSections([input.baseDescription, buildSearchFilesGuidance()]);
    }

    if (descriptionKind === 'write_file') {
        return joinSections([input.baseDescription, buildWriteFileGuidance()]);
    }

    if (descriptionKind === 'execute_code') {
        return joinSections([input.baseDescription, buildExecuteCodeGuidance()]);
    }

    return input.baseDescription;
}
