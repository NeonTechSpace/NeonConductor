import { describe, expect, it, vi } from 'vitest';

import {
    createProfileLibraryActions,
    createProfilePreferencesActions,
} from '@/web/components/settings/profileSettings/actions';

import type { ProfileRecord } from '@/app/backend/persistence/types';

const selectedProfile: ProfileRecord = {
    id: 'profile_default',
    name: 'Default',
    isActive: true,
    createdAt: '2026-03-30T10:00:00.000Z',
    updatedAt: '2026-03-30T10:00:00.000Z',
};

describe('profile settings actions', () => {
    it('keeps library actions focused on profile lifecycle mutations', async () => {
        const setStatusMessage = vi.fn();
        const setNewProfileName = vi.fn();
        const setSelectedProfileId = vi.fn();
        const updateProfileList = vi.fn();
        const actions = createProfileLibraryActions({
            activeProfileId: 'profile_default',
            selectedProfile,
            newProfileName: 'Work',
            renameValue: 'Work',
            updateProfileList,
            setActiveProfileCache: vi.fn(),
            createMutation: {
                mutateAsync: vi.fn().mockResolvedValue({
                    profile: {
                        ...selectedProfile,
                        id: 'profile_work',
                        name: 'Work',
                        isActive: false,
                    },
                }),
            },
            renameMutation: {
                mutateAsync: vi.fn(),
            },
            duplicateMutation: {
                mutateAsync: vi.fn(),
            },
            deleteMutation: {
                mutateAsync: vi.fn(),
            },
            setActiveMutation: {
                mutateAsync: vi.fn(),
            },
            setNewProfileName,
            setRenameDraft: vi.fn(),
            setSelectedProfileId,
            setStatusMessage,
            setConfirmDeleteOpen: vi.fn(),
            onProfileActivated: vi.fn(),
        });

        await actions.createProfile();

        expect(setStatusMessage).toHaveBeenCalledWith('Created profile "Work".');
        expect(setNewProfileName).toHaveBeenCalledWith('');
        expect(setSelectedProfileId).toHaveBeenCalledWith('profile_work');
        expect(updateProfileList).toHaveBeenCalledWith(expect.any(Function));
    });

    it('keeps preferences actions focused on edit preference updates', async () => {
        const setStatusMessage = vi.fn();
        const setEditPreferenceMutation = {
            mutateAsync: vi.fn().mockResolvedValue(undefined),
        };
        const actions = createProfilePreferencesActions({
            selectedProfile,
            setEditPreferenceMutation,
            setThreadTitlePreferenceMutation: {
                mutateAsync: vi.fn(),
            },
            setStatusMessage,
        });

        await actions.updateEditPreference('branch');

        expect(setEditPreferenceMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            value: 'branch',
        });
        expect(setStatusMessage).toHaveBeenCalledWith('Updated conversation edit behavior.');
    });

    it('updates the thread title mode without a separate AI model field', async () => {
        const setStatusMessage = vi.fn();
        const setThreadTitlePreferenceMutation = {
            mutateAsync: vi.fn().mockResolvedValue(undefined),
        };
        const actions = createProfilePreferencesActions({
            selectedProfile,
            setEditPreferenceMutation: {
                mutateAsync: vi.fn(),
            },
            setThreadTitlePreferenceMutation,
            setStatusMessage,
        });

        await actions.updateThreadTitleMode('ai_optional');

        expect(setThreadTitlePreferenceMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            mode: 'ai_optional',
        });
        expect(setStatusMessage).toHaveBeenCalledWith('Updated thread title generation settings.');
    });
});
