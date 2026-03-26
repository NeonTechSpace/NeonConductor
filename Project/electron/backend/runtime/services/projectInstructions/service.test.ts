import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveProjectInstructionDocuments } from '@/app/backend/runtime/services/projectInstructions/service';

describe('resolveProjectInstructionDocuments', () => {
    const temporaryRoots: string[] = [];

    afterEach(() => {
        for (const rootPath of temporaryRoots.splice(0)) {
            rmSync(rootPath, { recursive: true, force: true });
        }
    });

    it('loads AGENTS.md first, loads recursive .agents markdown files in sorted order, and strips frontmatter', async () => {
        const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-project-instructions-'));
        temporaryRoots.push(workspaceRoot);

        writeFileSync(
            path.join(workspaceRoot, 'AGENTS.md'),
            `---
title: ignored
---
# Primary Instructions

Use AGENTS first.
`,
            'utf8'
        );
        mkdirSync(path.join(workspaceRoot, '.agents', 'nested'), { recursive: true });
        writeFileSync(
            path.join(workspaceRoot, '.agents', 'z-last.md'),
            '# Z Last\n\nLoad after nested/a-first because of lexical sort.',
            'utf8'
        );
        writeFileSync(
            path.join(workspaceRoot, '.agents', 'nested', 'a-first.md'),
            `---
description: ignored
---
# A First

Nested content.
`,
            'utf8'
        );
        writeFileSync(path.join(workspaceRoot, '.agents', 'ignore.txt'), 'ignored', 'utf8');

        const documents = await resolveProjectInstructionDocuments({
            workspaceRootPath: workspaceRoot,
        });

        expect(documents.map((document) => document.displayPath)).toEqual([
            'AGENTS.md',
            '.agents/nested/a-first.md',
            '.agents/z-last.md',
        ]);
        expect(documents[0]?.bodyMarkdown).toBe('# Primary Instructions\n\nUse AGENTS first.');
        expect(documents[1]?.bodyMarkdown).toBe('# A First\n\nNested content.');
        expect(documents[2]?.bodyMarkdown).toBe('# Z Last\n\nLoad after nested/a-first because of lexical sort.');
    });

    it('returns an empty list when the workspace has no AGENTS inputs', async () => {
        const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'nc-project-instructions-empty-'));
        temporaryRoots.push(workspaceRoot);

        const documents = await resolveProjectInstructionDocuments({
            workspaceRootPath: workspaceRoot,
        });

        expect(documents).toEqual([]);
    });
});
