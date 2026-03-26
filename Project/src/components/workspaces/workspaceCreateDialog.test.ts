import { describe, expect, it, vi } from 'vitest';

import { submitWorkspaceCreateRequest } from '@/web/components/workspaces/workspaceCreateDialogSubmit';

describe('submitWorkspaceCreateRequest', () => {
    it('closes the dialog after a successful create', async () => {
        const onCreateWorkspace = vi.fn(() => Promise.resolve());
        const onClose = vi.fn();

        const result = await submitWorkspaceCreateRequest({
            onCreateWorkspace,
            onClose,
            createWorkspaceInput: {
                absolutePath: 'C:/workspace',
                label: 'Workspace',
                defaultTopLevelTab: 'agent',
                defaultProviderId: 'openai',
                defaultModelId: 'openai/gpt-5',
            },
        });

        expect(result).toBeUndefined();
        expect(onCreateWorkspace).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('returns the failure message and keeps the dialog open when create fails', async () => {
        const onCreateWorkspace = vi.fn(() => Promise.reject(new Error('Create failed.')));
        const onClose = vi.fn();

        const result = await submitWorkspaceCreateRequest({
            onCreateWorkspace,
            onClose,
            createWorkspaceInput: {
                absolutePath: 'C:/workspace',
                label: 'Workspace',
                defaultTopLevelTab: 'agent',
                defaultProviderId: 'openai',
                defaultModelId: 'openai/gpt-5',
            },
        });

        expect(result).toBe('Create failed.');
        expect(onClose).not.toHaveBeenCalled();
    });
});
