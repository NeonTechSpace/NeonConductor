import type { ModeRoleTemplateKey, ToolCapability, TopLevelTab } from '@/shared/contracts';

export const workerPresetIds = [
    'code_explorer',
    'web_researcher',
    'ui_verifier',
    'patch_reviewer',
    'dependency_auditor',
] as const;

export type WorkerPresetId = (typeof workerPresetIds)[number];

export interface WorkerPresetDefinition {
    id: WorkerPresetId;
    label: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    roleTemplate: ModeRoleTemplateKey;
    toolCapabilities: ToolCapability[];
    resultContractLabel: string;
    instructions: string;
}

const workerPresetDefinitions = [
    {
        id: 'code_explorer',
        label: 'Code Explorer',
        topLevelTab: 'agent',
        modeKey: 'research',
        roleTemplate: 'single_task_agent/research',
        toolCapabilities: ['filesystem_read', 'mcp'],
        resultContractLabel: 'evidence summary with inspected paths, findings, unknowns, and next-step recommendations',
        instructions:
            'Inspect relevant code and docs before answering. Return concise findings grounded in files or explicit unknowns; do not edit files.',
    },
    {
        id: 'web_researcher',
        label: 'Web Researcher',
        topLevelTab: 'agent',
        modeKey: 'research',
        roleTemplate: 'single_task_agent/research',
        toolCapabilities: ['filesystem_read', 'mcp'],
        resultContractLabel: 'source-attributed research summary with dated facts and residual uncertainty',
        instructions:
            'Gather evidence from approved research surfaces, separate source facts from inference, and preserve dates for time-sensitive claims.',
    },
    {
        id: 'ui_verifier',
        label: 'UI Verifier',
        topLevelTab: 'agent',
        modeKey: 'research',
        roleTemplate: 'single_task_agent/research',
        toolCapabilities: ['filesystem_read', 'mcp'],
        resultContractLabel: 'rendered-state verification report with screenshots or skipped-check reasons',
        instructions:
            'Verify actual rendered states when available. Report observed behavior, screenshots captured, accessibility issues, and skipped checks.',
    },
    {
        id: 'patch_reviewer',
        label: 'Patch Reviewer',
        topLevelTab: 'agent',
        modeKey: 'research',
        roleTemplate: 'single_task_agent/review',
        toolCapabilities: ['filesystem_read', 'mcp'],
        resultContractLabel: 'review findings ordered by severity with file references and test gaps',
        instructions:
            'Review for correctness, security, maintainability, and missing validation. Lead with concrete findings and avoid broad summaries without evidence.',
    },
    {
        id: 'dependency_auditor',
        label: 'Dependency Auditor',
        topLevelTab: 'agent',
        modeKey: 'research',
        roleTemplate: 'single_task_agent/research',
        toolCapabilities: ['filesystem_read', 'mcp'],
        resultContractLabel: 'dependency risk report with package, version, source, and recommended action',
        instructions:
            'Inspect dependency manifests and lockfiles. Report concrete package risks, compatibility issues, and validation commands.',
    },
] as const satisfies readonly WorkerPresetDefinition[];

const workerPresetDefinitionById = new Map(workerPresetDefinitions.map((preset) => [preset.id, preset] as const));

export function listWorkerPresetDefinitions(): WorkerPresetDefinition[] {
    return workerPresetDefinitions.map((preset) => ({ ...preset, toolCapabilities: [...preset.toolCapabilities] }));
}

export function getWorkerPresetDefinition(workerPresetId: WorkerPresetId): WorkerPresetDefinition {
    const definition = workerPresetDefinitionById.get(workerPresetId);
    if (!definition) {
        throw new Error(`Unknown worker preset "${workerPresetId}".`);
    }

    return { ...definition, toolCapabilities: [...definition.toolCapabilities] };
}

export function isWorkerPresetId(value: string): value is WorkerPresetId {
    return workerPresetIds.includes(value as WorkerPresetId);
}
