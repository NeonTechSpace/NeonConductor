export function getRenameProfileStatusMessage(input: { updated: boolean; profileName: string | undefined }): string {
    return input.updated && input.profileName
        ? `Renamed profile to "${input.profileName}".`
        : 'Rename failed: profile not found.';
}

export function getDuplicateProfileStatusMessage(input: {
    duplicated: boolean;
    profileName: string | undefined;
}): string {
    return input.duplicated && input.profileName
        ? `Duplicated as "${input.profileName}".`
        : 'Duplicate failed: profile not found.';
}

export function getActivateProfileStatusMessage(input: { updated: boolean; profileName: string | undefined }): string {
    return input.updated && input.profileName
        ? `Active profile set to "${input.profileName}".`
        : 'Set active failed: profile not found.';
}

export function getDeleteProfileStatusMessage(input: {
    deleted: boolean;
    reason: 'last_profile' | 'profile_not_found' | undefined;
}): string {
    if (input.deleted) {
        return 'Profile deleted.';
    }

    return input.reason === 'last_profile'
        ? 'Cannot delete the last remaining profile.'
        : 'Delete failed: profile not found.';
}
