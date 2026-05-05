import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const removedScriptNames = [
    'prep',
    'codegen',
    'check',
    'check:fast',
    'check:repair-first',
    'audit:repair-first',
    'audit:repair-first:worklist',
    'audit:repair-first:json',
    'audit:agents',
    'audit:agents:report',
    'audit:agents:json',
    'audit:agents:worklist',
    'audit:agents:worklist:new',
    'audit:agents:worklist:stale',
    'doctor:desktop',
    'doctor:desktop:dev',
    'launch:desktop',
    'lint:base',
    'typecheck:base',
    'fix',
] as const;

const canonicalScriptNames = [
    'generated:check',
    'generated:update',
    'health:baseline',
    'health:quick',
    'health:ci',
    'health:full',
    'health:alpha-exit',
    'report:health-baseline',
    'report:agents',
    'report:alpha',
    'report:alpha:json',
    'report:alpha:check',
    'report:alpha-evals',
    'report:alpha-evals:json',
    'report:alpha-evals:check',
    'marketplace:catalog:check',
    'desktop:doctor',
    'desktop:doctor:dev',
    'desktop:launch',
] as const;

const removedCurrentDocReferences = [
    'pnpm -C Project prep',
    'pnpm -C Project codegen',
    'pnpm -C Project check:fast',
    'pnpm -C Project check',
    'pnpm -C Project check:repair-first',
    'pnpm -C Project audit:agents',
    'pnpm -C Project audit:agents:worklist:new',
    'pnpm -C Project doctor:desktop',
    'pnpm -C Project doctor:desktop:dev',
    'pnpm -C Project launch:desktop',
    'pnpm -C Project lint:base',
    'pnpm -C Project typecheck:base',
] as const;

function readPackageScripts(): Record<string, string> {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        scripts: Record<string, string>;
    };
    return packageJson.scripts;
}

describe('project command surface', () => {
    it('keeps the package script surface on canonical health command names', () => {
        const scripts = readPackageScripts();

        for (const scriptName of canonicalScriptNames) {
            expect(scripts[scriptName]).toBeDefined();
        }

        for (const scriptName of removedScriptNames) {
            expect(scripts[scriptName]).toBeUndefined();
        }
    });

    it('keeps current workflow and contributor docs off removed package script names', () => {
        const repositoryRoot = path.resolve(process.cwd(), '..');
        const checkedFiles = [
            'AGENTS.md',
            'Markdown/CONTRIBUTING.md',
            '.github/pull_request_template.md',
            '.github/workflows/project-checks.yml',
            '.github/workflows/security-health.yml',
            '.github/workflows/pr-auto-fix.yml',
        ];

        for (const relativePath of checkedFiles) {
            const content = readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
            for (const reference of removedCurrentDocReferences) {
                expect(content, `${relativePath} still references ${reference}`).not.toContain(reference);
            }
        }
    });
});
