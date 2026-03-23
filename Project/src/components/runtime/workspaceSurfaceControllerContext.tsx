import { createContext, useContext } from 'react';

import type { ReactNode } from 'react';

import type { ConversationShellBootChromeReadiness } from '@/web/components/runtime/bootReadiness';
import type { useWorkspaceSurfaceController } from '@/web/components/runtime/workspaceSurfaceController';

interface WorkspaceSurfaceControllerContextValue {
    controller: ReturnType<typeof useWorkspaceSurfaceController>;
    onConversationShellBootReadinessChange: (readiness: ConversationShellBootChromeReadiness) => void;
}

const WorkspaceSurfaceControllerContext = createContext<WorkspaceSurfaceControllerContextValue | null>(null);

export function WorkspaceSurfaceControllerProvider({
    value,
    children,
}: {
    value: WorkspaceSurfaceControllerContextValue;
    children: ReactNode;
}) {
    return <WorkspaceSurfaceControllerContext.Provider value={value}>{children}</WorkspaceSurfaceControllerContext.Provider>;
}

export function useWorkspaceSurfaceControllerContext(): WorkspaceSurfaceControllerContextValue {
    const value = useContext(WorkspaceSurfaceControllerContext);
    if (!value) {
        throw new Error('WorkspaceSurfaceControllerContext is not available.');
    }

    return value;
}
