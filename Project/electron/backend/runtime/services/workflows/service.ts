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
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

interface PersistedWorkflowRecord {
    id: string;
    label: string;
    command: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

function sanitizeWorkflowFields(input: {
    label: string;
    command: string;
}): OperationalResult<{ label: string; command: string }> {
    const label = input.label.trim();
    const command = input.command.trim();
    if (label.length === 0) {
        return errOp('invalid_input', 'Workflow label is required.');
    }
    if (command.length === 0) {
        return errOp('invalid_input', 'Workflow command is required.');
    }

    return okOp({
        label,
        command,
    });
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

async function resolveWorkflowDirectory(input: {
    profileId: string;
    workspaceFingerprint: string;
}): Promise<OperationalResult<string>> {
    const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, input.workspaceFingerprint);
    if (!workspaceRoot) {
        return errOp('not_found', `Workspace "${input.workspaceFingerprint}" is not registered.`);
    }

    const directory = path.join(workspaceRoot.absolutePath, '.neonconductor', 'workflows');
    await mkdir(directory, { recursive: true });
    return okOp(directory);
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
        if (sanitized.isErr()) {
            return null;
        }

        return {
            id: parsed.id,
            label: sanitized.value.label,
            command: sanitized.value.command,
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
    async listProjectWorkflows(input: {
        profileId: string;
        workspaceFingerprint: string;
    }): Promise<OperationalResult<ProjectWorkflowRecord[]>> {
        const directory = await resolveWorkflowDirectory(input);
        if (directory.isErr()) {
            return errOp(directory.error.code, directory.error.message);
        }
        const dirents = await readdir(directory.value, { withFileTypes: true });
        const jsonFiles = dirents
            .filter((dirent) => dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.json')
            .map((dirent) => dirent.name)
            .sort((left, right) => left.localeCompare(right));
        const workflows = await Promise.all(
            jsonFiles.map((fileName) => readWorkflowFile(path.join(directory.value, fileName)))
        );

        return okOp(
            workflows
                .filter((workflow): workflow is ProjectWorkflowRecord => workflow !== null)
                .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))
        );
    }

    async getProjectWorkflow(input: {
        profileId: string;
        workspaceFingerprint: string;
        workflowId: string;
    }): Promise<OperationalResult<ProjectWorkflowRecord | null>> {
        const directory = await resolveWorkflowDirectory(input);
        if (directory.isErr()) {
            return errOp(directory.error.code, directory.error.message);
        }
        return okOp(await readWorkflowFile(path.join(directory.value, toWorkflowFileName(input.workflowId))));
    }

    async createProjectWorkflow(input: ProjectWorkflowCreateInput): Promise<OperationalResult<ProjectWorkflowRecord>> {
        const directory = await resolveWorkflowDirectory(input);
        if (directory.isErr()) {
            return errOp(directory.error.code, directory.error.message);
        }
        const sanitized = sanitizeWorkflowFields({
            label: input.label,
            command: input.command,
        });
        if (sanitized.isErr()) {
            return errOp(sanitized.error.code, sanitized.error.message);
        }
        const now = new Date().toISOString();
        const workflow: ProjectWorkflowRecord = {
            id: `workflow_${randomUUID()}`,
            label: sanitized.value.label,
            command: sanitized.value.command,
            enabled: input.enabled,
            createdAt: now,
            updatedAt: now,
        };

        await writeWorkflowFile({
            absolutePath: path.join(directory.value, toWorkflowFileName(workflow.id)),
            fileContent: JSON.stringify(workflow, null, 2),
        });

        return okOp(workflow);
    }

    async updateProjectWorkflow(
        input: ProjectWorkflowUpdateInput
    ): Promise<OperationalResult<ProjectWorkflowRecord | null>> {
        const directory = await resolveWorkflowDirectory(input);
        if (directory.isErr()) {
            return errOp(directory.error.code, directory.error.message);
        }
        const absolutePath = path.join(directory.value, toWorkflowFileName(input.workflowId));
        const existing = await readWorkflowFile(absolutePath);
        if (!existing) {
            return okOp(null);
        }

        const sanitized = sanitizeWorkflowFields({
            label: input.label,
            command: input.command,
        });
        if (sanitized.isErr()) {
            return errOp(sanitized.error.code, sanitized.error.message);
        }
        const updated: ProjectWorkflowRecord = {
            ...existing,
            label: sanitized.value.label,
            command: sanitized.value.command,
            enabled: input.enabled,
            updatedAt: new Date().toISOString(),
        };

        await writeWorkflowFile({
            absolutePath,
            fileContent: JSON.stringify(updated, null, 2),
        });

        return okOp(updated);
    }

    async deleteProjectWorkflow(input: ProjectWorkflowDeleteInput): Promise<OperationalResult<boolean>> {
        if (!input.confirm) {
            return errOp('invalid_input', 'Deleting a workflow requires explicit confirmation.');
        }

        const directory = await resolveWorkflowDirectory(input);
        if (directory.isErr()) {
            return errOp(directory.error.code, directory.error.message);
        }
        const absolutePath = path.join(directory.value, toWorkflowFileName(input.workflowId));
        if (!(await fileExists(absolutePath))) {
            return okOp(false);
        }

        await unlink(absolutePath);
        return okOp(true);
    }
}

export const workflowService = new WorkflowService();
