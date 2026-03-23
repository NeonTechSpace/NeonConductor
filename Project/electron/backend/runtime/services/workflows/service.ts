import { randomUUID } from 'node:crypto';
import { access, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { workspaceRootStore } from '@/app/backend/persistence/stores';
import type {
    ProjectWorkflowCreateInput,
    ProjectWorkflowDeleteInput,
    ProjectWorkflowRecord,
    ProjectWorkflowUpdateInput,
} from '@/app/backend/runtime/contracts';

interface PersistedWorkflowRecord {
    id: string;
    label: string;
    command: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

function sanitizeWorkflowFields(input: { label: string; command: string }) {
    const label = input.label.trim();
    const command = input.command.trim();
    if (label.length === 0) {
        throw new Error('Workflow label is required.');
    }
    if (command.length === 0) {
        throw new Error('Workflow command is required.');
    }

    return {
        label,
        command,
    };
}

async function fileExists(absolutePath: string): Promise<boolean> {
    try {
        await access(absolutePath);
        return true;
    } catch {
        return false;
    }
}

async function writeWorkflowFile(input: { absolutePath: string; fileContent: string }): Promise<void> {
    const directory = path.dirname(input.absolutePath);
    await mkdir(directory, { recursive: true });
    const tempPath = `${input.absolutePath}.tmp`;
    await writeFile(tempPath, input.fileContent, 'utf8');
    await rename(tempPath, input.absolutePath);
}

function isPersistedWorkflowRecord(value: unknown): value is PersistedWorkflowRecord {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate['id'] === 'string' &&
        typeof candidate['label'] === 'string' &&
        typeof candidate['command'] === 'string' &&
        typeof candidate['enabled'] === 'boolean' &&
        typeof candidate['createdAt'] === 'string' &&
        typeof candidate['updatedAt'] === 'string'
    );
}

async function resolveWorkflowDirectory(input: { profileId: string; workspaceFingerprint: string }): Promise<string> {
    const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, input.workspaceFingerprint);
    if (!workspaceRoot) {
        throw new Error(`Workspace "${input.workspaceFingerprint}" is not registered.`);
    }

    const directory = path.join(workspaceRoot.absolutePath, '.neonconductor', 'workflows');
    await mkdir(directory, { recursive: true });
    return directory;
}

async function readWorkflowFile(absolutePath: string): Promise<ProjectWorkflowRecord | null> {
    try {
        const content = await readFile(absolutePath, 'utf8');
        const parsed = JSON.parse(content) as unknown;
        if (!isPersistedWorkflowRecord(parsed)) {
            return null;
        }

        const sanitized = sanitizeWorkflowFields({
            label: parsed.label,
            command: parsed.command,
        });

        return {
            id: parsed.id,
            label: sanitized.label,
            command: sanitized.command,
            enabled: parsed.enabled,
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt,
        };
    } catch {
        return null;
    }
}

function toWorkflowFileName(workflowId: string): string {
    return `${workflowId}.json`;
}

export class WorkflowService {
    async listProjectWorkflows(input: { profileId: string; workspaceFingerprint: string }): Promise<ProjectWorkflowRecord[]> {
        const directory = await resolveWorkflowDirectory(input);
        const dirents = await readdir(directory, { withFileTypes: true });
        const jsonFiles = dirents
            .filter((dirent) => dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.json')
            .map((dirent) => dirent.name)
            .sort((left, right) => left.localeCompare(right));
        const workflows = await Promise.all(
            jsonFiles.map((fileName) => readWorkflowFile(path.join(directory, fileName)))
        );

        return workflows
            .filter((workflow): workflow is ProjectWorkflowRecord => workflow !== null)
            .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id));
    }

    async getProjectWorkflow(input: {
        profileId: string;
        workspaceFingerprint: string;
        workflowId: string;
    }): Promise<ProjectWorkflowRecord | null> {
        const directory = await resolveWorkflowDirectory(input);
        return readWorkflowFile(path.join(directory, toWorkflowFileName(input.workflowId)));
    }

    async createProjectWorkflow(input: ProjectWorkflowCreateInput): Promise<ProjectWorkflowRecord> {
        const directory = await resolveWorkflowDirectory(input);
        const sanitized = sanitizeWorkflowFields({
            label: input.label,
            command: input.command,
        });
        const now = new Date().toISOString();
        const workflow: ProjectWorkflowRecord = {
            id: `workflow_${randomUUID()}`,
            label: sanitized.label,
            command: sanitized.command,
            enabled: input.enabled,
            createdAt: now,
            updatedAt: now,
        };

        await writeWorkflowFile({
            absolutePath: path.join(directory, toWorkflowFileName(workflow.id)),
            fileContent: JSON.stringify(workflow, null, 2),
        });

        return workflow;
    }

    async updateProjectWorkflow(input: ProjectWorkflowUpdateInput): Promise<ProjectWorkflowRecord | null> {
        const directory = await resolveWorkflowDirectory(input);
        const absolutePath = path.join(directory, toWorkflowFileName(input.workflowId));
        const existing = await readWorkflowFile(absolutePath);
        if (!existing) {
            return null;
        }

        const sanitized = sanitizeWorkflowFields({
            label: input.label,
            command: input.command,
        });
        const updated: ProjectWorkflowRecord = {
            ...existing,
            label: sanitized.label,
            command: sanitized.command,
            enabled: input.enabled,
            updatedAt: new Date().toISOString(),
        };

        await writeWorkflowFile({
            absolutePath,
            fileContent: JSON.stringify(updated, null, 2),
        });

        return updated;
    }

    async deleteProjectWorkflow(input: ProjectWorkflowDeleteInput): Promise<boolean> {
        if (!input.confirm) {
            throw new Error('Deleting a workflow requires explicit confirmation.');
        }

        const directory = await resolveWorkflowDirectory(input);
        const absolutePath = path.join(directory, toWorkflowFileName(input.workflowId));
        if (!(await fileExists(absolutePath))) {
            return false;
        }

        await unlink(absolutePath);
        return true;
    }
}

export const workflowService = new WorkflowService();
