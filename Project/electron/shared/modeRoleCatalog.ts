import type {
    BehaviorFlag,
    InternalModelRole,
    ModeAuthoringRole,
    ModeRoleTemplateKey,
    RuntimeRequirementProfile,
    ToolCapability,
    TopLevelTab,
    WorkflowCapability,
} from '@/shared/contracts';

export interface ModeTemplateExecutionMetadata {
    topLevelTab: TopLevelTab;
    toolCapabilities: ToolCapability[];
    workflowCapabilities: WorkflowCapability[];
    behaviorFlags: BehaviorFlag[];
    runtimeProfile: RuntimeRequirementProfile;
    internalModelRole: InternalModelRole;
    delegatedOnly: boolean;
    sessionSelectable: boolean;
}

export interface ModeRoleTemplateDefinition extends ModeTemplateExecutionMetadata {
    authoringRole: ModeAuthoringRole;
    roleTemplate: ModeRoleTemplateKey;
    label: string;
}

export interface ModeExecutionMetadataLike {
    authoringRole?: ModeAuthoringRole;
    roleTemplate?: ModeRoleTemplateKey;
    internalModelRole?: InternalModelRole;
    delegatedOnly?: boolean;
    sessionSelectable?: boolean;
    planningOnly?: boolean;
    readOnly?: boolean;
    toolCapabilities?: ToolCapability[];
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
}

export interface NormalizedModeExecutionMetadata extends ModeExecutionMetadataLike {
    authoringRole: ModeAuthoringRole;
    roleTemplate: ModeRoleTemplateKey;
    internalModelRole: InternalModelRole;
    delegatedOnly: boolean;
    sessionSelectable: boolean;
    toolCapabilities: ToolCapability[];
    workflowCapabilities: WorkflowCapability[];
    behaviorFlags: BehaviorFlag[];
    runtimeProfile: RuntimeRequirementProfile;
}

const modeRoleTemplateDefinitions = [
    {
        authoringRole: 'chat',
        roleTemplate: 'chat/default',
        label: 'Chat',
        topLevelTab: 'chat',
        toolCapabilities: [],
        workflowCapabilities: [],
        behaviorFlags: [],
        runtimeProfile: 'general',
        internalModelRole: 'chat',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'single_task_agent',
        roleTemplate: 'single_task_agent/ask',
        label: 'Ask',
        topLevelTab: 'agent',
        toolCapabilities: ['filesystem_read'],
        workflowCapabilities: [],
        behaviorFlags: ['read_only_execution'],
        runtimeProfile: 'read_only_agent',
        internalModelRole: 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'single_task_agent',
        roleTemplate: 'single_task_agent/plan',
        label: 'Plan',
        topLevelTab: 'agent',
        toolCapabilities: ['filesystem_read', 'mcp'],
        workflowCapabilities: ['planning', 'artifact_view', 'recovery'],
        behaviorFlags: ['approval_gated', 'artifact_producing', 'read_only_execution'],
        runtimeProfile: 'planner',
        internalModelRole: 'planner',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'single_task_agent',
        roleTemplate: 'single_task_agent/apply',
        label: 'Apply',
        topLevelTab: 'agent',
        toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'mcp', 'code_runtime'],
        workflowCapabilities: ['artifact_view'],
        behaviorFlags: ['workspace_mutating', 'checkpoint_eligible', 'artifact_producing'],
        runtimeProfile: 'mutating_agent',
        internalModelRole: 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'single_task_agent',
        roleTemplate: 'single_task_agent/debug',
        label: 'Debug',
        topLevelTab: 'agent',
        toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'mcp', 'code_runtime'],
        workflowCapabilities: ['artifact_view'],
        behaviorFlags: ['workspace_mutating', 'checkpoint_eligible', 'artifact_producing'],
        runtimeProfile: 'mutating_agent',
        internalModelRole: 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'single_task_agent',
        roleTemplate: 'single_task_agent/research',
        label: 'Research',
        topLevelTab: 'agent',
        toolCapabilities: ['filesystem_read', 'mcp'],
        workflowCapabilities: ['artifact_view'],
        behaviorFlags: ['read_only_execution', 'artifact_producing'],
        runtimeProfile: 'read_only_agent',
        internalModelRole: 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'single_task_agent',
        roleTemplate: 'single_task_agent/review',
        label: 'Review',
        topLevelTab: 'agent',
        toolCapabilities: ['filesystem_read', 'mcp'],
        workflowCapabilities: ['review', 'artifact_view'],
        behaviorFlags: ['read_only_execution', 'artifact_producing'],
        runtimeProfile: 'reviewer',
        internalModelRole: 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'orchestrator_primary',
        roleTemplate: 'orchestrator_primary/plan',
        label: 'Orchestrator Plan',
        topLevelTab: 'orchestrator',
        toolCapabilities: ['filesystem_read', 'mcp'],
        workflowCapabilities: ['planning', 'orchestration', 'artifact_view', 'recovery'],
        behaviorFlags: ['approval_gated', 'artifact_producing', 'read_only_execution'],
        runtimeProfile: 'planner',
        internalModelRole: 'planner',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'orchestrator_primary',
        roleTemplate: 'orchestrator_primary/orchestrate',
        label: 'Orchestrate',
        topLevelTab: 'orchestrator',
        toolCapabilities: ['filesystem_read'],
        workflowCapabilities: ['orchestration', 'artifact_view'],
        behaviorFlags: ['checkpoint_eligible', 'artifact_producing', 'child_worker_capable'],
        runtimeProfile: 'orchestrator',
        internalModelRole: 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'orchestrator_primary',
        roleTemplate: 'orchestrator_primary/debug',
        label: 'Orchestrator Debug',
        topLevelTab: 'orchestrator',
        toolCapabilities: ['filesystem_read'],
        workflowCapabilities: ['orchestration', 'artifact_view'],
        behaviorFlags: ['checkpoint_eligible', 'artifact_producing', 'child_worker_capable'],
        runtimeProfile: 'orchestrator',
        internalModelRole: 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
    },
    {
        authoringRole: 'orchestrator_worker_agent',
        roleTemplate: 'orchestrator_worker_agent/apply',
        label: 'Worker Apply',
        topLevelTab: 'agent',
        toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'mcp', 'code_runtime'],
        workflowCapabilities: ['artifact_view'],
        behaviorFlags: ['workspace_mutating', 'checkpoint_eligible', 'artifact_producing'],
        runtimeProfile: 'mutating_agent',
        internalModelRole: 'apply',
        delegatedOnly: true,
        sessionSelectable: false,
    },
    {
        authoringRole: 'orchestrator_worker_agent',
        roleTemplate: 'orchestrator_worker_agent/debug',
        label: 'Worker Debug',
        topLevelTab: 'agent',
        toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'mcp', 'code_runtime'],
        workflowCapabilities: ['artifact_view'],
        behaviorFlags: ['workspace_mutating', 'checkpoint_eligible', 'artifact_producing'],
        runtimeProfile: 'mutating_agent',
        internalModelRole: 'apply',
        delegatedOnly: true,
        sessionSelectable: false,
    },
] as const satisfies readonly ModeRoleTemplateDefinition[];

const roleTemplateDefinitionByKey = new Map(
    modeRoleTemplateDefinitions.map((definition) => [definition.roleTemplate, definition] as const)
);

function uniqueValues<T extends string>(values: readonly T[] | undefined): T[] {
    if (!values || values.length === 0) {
        return [];
    }

    return Array.from(new Set(values));
}

function isModeRoleTemplateKeyForRole(authoringRole: ModeAuthoringRole, roleTemplate: ModeRoleTemplateKey): boolean {
    const definition = roleTemplateDefinitionByKey.get(roleTemplate);
    return definition?.authoringRole === authoringRole;
}

export function listModeRoleTemplateDefinitions(): ModeRoleTemplateDefinition[] {
    return modeRoleTemplateDefinitions.map((definition) => ({ ...definition }));
}

export function getModeRoleTemplateDefinition(roleTemplate: ModeRoleTemplateKey): ModeRoleTemplateDefinition {
    const definition = roleTemplateDefinitionByKey.get(roleTemplate);
    if (!definition) {
        throw new Error(`Unknown mode role template "${roleTemplate}".`);
    }

    return { ...definition };
}

export function listModeRoleTemplatesForAuthoringRole(authoringRole: ModeAuthoringRole): ModeRoleTemplateDefinition[] {
    return modeRoleTemplateDefinitions
        .filter((definition) => definition.authoringRole === authoringRole)
        .map((definition) => ({ ...definition }));
}

function inferAuthoringRoleFromTopLevelTab(topLevelTab: TopLevelTab | undefined): ModeAuthoringRole {
    if (topLevelTab === 'chat') {
        return 'chat';
    }
    if (topLevelTab === 'orchestrator') {
        return 'orchestrator_primary';
    }

    return 'single_task_agent';
}

function inferRoleTemplateFromLegacyMetadata(input: {
    topLevelTab?: TopLevelTab;
    modeKey?: string;
    planningOnly?: boolean;
    readOnly?: boolean;
    workflowCapabilities?: WorkflowCapability[];
    behaviorFlags?: BehaviorFlag[];
    runtimeProfile?: RuntimeRequirementProfile;
    authoringRole?: ModeAuthoringRole;
}): ModeRoleTemplateKey {
    const modeKey = input.modeKey?.trim().toLowerCase();
    const workflowCapabilities = new Set(input.workflowCapabilities ?? []);
    const behaviorFlags = new Set(input.behaviorFlags ?? []);
    const authoringRole = input.authoringRole ?? inferAuthoringRoleFromTopLevelTab(input.topLevelTab);

    if (authoringRole === 'chat') {
        return 'chat/default';
    }

    if (authoringRole === 'orchestrator_worker_agent') {
        return modeKey === 'debug' ? 'orchestrator_worker_agent/debug' : 'orchestrator_worker_agent/apply';
    }

    if (authoringRole === 'orchestrator_primary') {
        if (modeKey === 'plan' || input.planningOnly || workflowCapabilities.has('planning')) {
            return 'orchestrator_primary/plan';
        }
        if (
            modeKey === 'orchestrate' ||
            input.runtimeProfile === 'orchestrator' ||
            behaviorFlags.has('child_worker_capable') ||
            workflowCapabilities.has('orchestration')
        ) {
            return 'orchestrator_primary/orchestrate';
        }

        return 'orchestrator_primary/debug';
    }

    if (modeKey === 'plan' || input.planningOnly || workflowCapabilities.has('planning')) {
        return 'single_task_agent/plan';
    }
    if (workflowCapabilities.has('review') || input.runtimeProfile === 'reviewer') {
        return 'single_task_agent/review';
    }
    if (modeKey === 'research') {
        return 'single_task_agent/research';
    }
    if (
        modeKey === 'ask' ||
        input.readOnly ||
        input.runtimeProfile === 'read_only_agent' ||
        (behaviorFlags.has('read_only_execution') && !behaviorFlags.has('workspace_mutating'))
    ) {
        return 'single_task_agent/ask';
    }
    if (modeKey === 'debug') {
        return 'single_task_agent/debug';
    }

    return 'single_task_agent/apply';
}

export function normalizeModeExecutionMetadata(input: {
    topLevelTab?: TopLevelTab;
    modeKey?: string;
    policy?: ModeExecutionMetadataLike;
}): NormalizedModeExecutionMetadata {
    const policy = input.policy ?? {};
    const authoringRole = policy.authoringRole ?? inferAuthoringRoleFromTopLevelTab(input.topLevelTab);
    const inferredRoleTemplate = inferRoleTemplateFromLegacyMetadata({
        ...(input.topLevelTab ? { topLevelTab: input.topLevelTab } : {}),
        ...(input.modeKey ? { modeKey: input.modeKey } : {}),
        ...(policy.planningOnly !== undefined ? { planningOnly: policy.planningOnly } : {}),
        ...(policy.readOnly !== undefined ? { readOnly: policy.readOnly } : {}),
        ...(policy.workflowCapabilities ? { workflowCapabilities: policy.workflowCapabilities } : {}),
        ...(policy.behaviorFlags ? { behaviorFlags: policy.behaviorFlags } : {}),
        ...(policy.runtimeProfile ? { runtimeProfile: policy.runtimeProfile } : {}),
        authoringRole,
    });
    const roleTemplate =
        policy.roleTemplate && isModeRoleTemplateKeyForRole(authoringRole, policy.roleTemplate)
            ? policy.roleTemplate
            : inferredRoleTemplate;
    const templateDefinition = getModeRoleTemplateDefinition(roleTemplate);

    return {
        authoringRole,
        roleTemplate,
        internalModelRole: policy.internalModelRole ?? templateDefinition.internalModelRole,
        delegatedOnly: policy.delegatedOnly ?? templateDefinition.delegatedOnly,
        sessionSelectable: policy.sessionSelectable ?? !(
            policy.delegatedOnly ?? templateDefinition.delegatedOnly
        ),
        ...(policy.planningOnly !== undefined ? { planningOnly: policy.planningOnly } : {}),
        toolCapabilities: uniqueValues(policy.toolCapabilities ?? templateDefinition.toolCapabilities),
        workflowCapabilities: uniqueValues(policy.workflowCapabilities ?? templateDefinition.workflowCapabilities),
        behaviorFlags: uniqueValues(policy.behaviorFlags ?? templateDefinition.behaviorFlags),
        runtimeProfile: policy.runtimeProfile ?? templateDefinition.runtimeProfile,
    };
}
