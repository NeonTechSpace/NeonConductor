import { useDeferredValue, useState } from 'react';

import type { WorkspaceRootRecord } from '@/shared/contracts/types/runtime';

export function useRegistryScopeSelectionState(workspaceRoots: WorkspaceRootRecord[]) {
    const [selectedWorkspaceFingerprint, setSelectedWorkspaceFingerprint] = useState<string | undefined>(undefined);
    const [skillQuery, setSkillQuery] = useState('');
    const resolvedSelectedWorkspaceFingerprint =
        selectedWorkspaceFingerprint &&
        workspaceRoots.some((workspaceRoot) => workspaceRoot.fingerprint === selectedWorkspaceFingerprint)
            ? selectedWorkspaceFingerprint
            : undefined;
    const deferredSkillQuery = useDeferredValue(skillQuery.trim());

    return {
        selectedWorkspaceFingerprint: resolvedSelectedWorkspaceFingerprint,
        setSelectedWorkspaceFingerprint,
        skillQuery,
        setSkillQuery,
        deferredSkillQuery,
    };
}
