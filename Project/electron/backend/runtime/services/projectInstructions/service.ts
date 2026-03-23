import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { readRegistryMarkdownBody } from '@/app/backend/runtime/services/registry/filesystem';

export interface ProjectInstructionDocument {
    displayPath: string;
    bodyMarkdown: string;
}

async function listMarkdownFiles(rootPath: string, relativePrefix = ''): Promise<string[]> {
    let dirents: Array<{
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
    }>;
    try {
        dirents = (await readdir(rootPath, { withFileTypes: true, encoding: 'utf8' })).map((dirent) => ({
            name: String(dirent.name),
            isDirectory: () => dirent.isDirectory(),
            isFile: () => dirent.isFile(),
        }));
    } catch (error) {
        if (
            error instanceof Error &&
            'code' in error &&
            (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        ) {
            return [];
        }
        throw error;
    }

    const relativePaths: string[] = [];
    for (const dirent of dirents) {
        const absolutePath = path.join(rootPath, dirent.name);
        const relativePath = relativePrefix.length > 0 ? path.join(relativePrefix, dirent.name) : dirent.name;
        if (dirent.isDirectory()) {
            relativePaths.push(...(await listMarkdownFiles(absolutePath, relativePath)));
            continue;
        }

        if (dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.md') {
            relativePaths.push(relativePath.replace(/\\/g, '/'));
        }
    }

    return relativePaths.sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));
}

async function readOptionalInstructionDocument(input: {
    absolutePath: string;
    displayPath: string;
}): Promise<ProjectInstructionDocument | undefined> {
    try {
        const bodyMarkdown = (await readRegistryMarkdownBody(input.absolutePath)).trim();
        if (bodyMarkdown.length === 0) {
            return undefined;
        }

        return {
            displayPath: input.displayPath,
            bodyMarkdown,
        };
    } catch (error) {
        if (
            error instanceof Error &&
            'code' in error &&
            (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        ) {
            return undefined;
        }

        return undefined;
    }
}

export async function resolveProjectInstructionDocuments(input: {
    workspaceRootPath?: string;
}): Promise<ProjectInstructionDocument[]> {
    if (!input.workspaceRootPath) {
        return [];
    }

    const documents: ProjectInstructionDocument[] = [];
    const agentsDocument = await readOptionalInstructionDocument({
        absolutePath: path.join(input.workspaceRootPath, 'AGENTS.md'),
        displayPath: 'AGENTS.md',
    });
    if (agentsDocument) {
        documents.push(agentsDocument);
    }

    const agentsDirectoryPath = path.join(input.workspaceRootPath, '.agents');
    const relativePaths = await listMarkdownFiles(agentsDirectoryPath);
    const modularDocuments = await Promise.all(
        relativePaths.map(async (relativePath) =>
            readOptionalInstructionDocument({
                absolutePath: path.join(agentsDirectoryPath, relativePath),
                displayPath: `.agents/${relativePath}`,
            })
        )
    );
    for (const document of modularDocuments) {
        if (document) {
            documents.push(document);
        }
    }

    return documents;
}
