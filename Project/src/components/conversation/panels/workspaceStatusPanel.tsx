import { formatInteger, methodLabel } from '@/web/components/settings/providerSettings/helpers';

import type { ProviderUsageSummary, RunRecord } from '@/app/backend/persistence/types';

interface WorkspaceStatusPanelProps {
    run: RunRecord | undefined;
    executionPreset: 'privacy' | 'standard' | 'yolo';
    workspaceScope:
        | {
              kind: 'detached';
          }
        | {
          kind: 'workspace';
          label: string;
          absolutePath: string;
          executionEnvironmentMode: 'local' | 'new_sandbox';
      }
    | {
          kind: 'sandbox';
          label: string;
          absolutePath: string;
          baseWorkspaceLabel: string;
          baseWorkspacePath: string;
          sandboxId: string;
          };
    provider:
        | {
              label: string;
              authState: string;
              authMethod: string;
          }
        | undefined;
    modelLabel: string | undefined;
    usageSummary: ProviderUsageSummary | undefined;
    routingBadge: string | undefined;
    registrySummary?:
        | {
              modes: number;
              rulesets: number;
              skillfiles: number;
          }
        | undefined;
    agentContextSummary?:
        | {
              modeLabel: string;
              rulesetCount: number;
              attachedRuleCount: number;
              attachedSkillCount: number;
          }
        | undefined;
}

function formatMicrounits(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return '-';
    }

    return `${Math.round(value).toLocaleString()} microunits`;
}

function StatusCard({
    label,
    value,
    detail,
}: {
    label: string;
    value: string;
    detail: string;
}) {
    return (
        <div className='border-border bg-card/90 rounded-2xl border px-4 py-3 shadow-sm'>
            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>{label}</p>
            <p className='mt-2 text-sm font-semibold text-balance'>{value}</p>
            <p className='text-muted-foreground mt-1 text-xs'>{detail}</p>
        </div>
    );
}

export function WorkspaceStatusPanel({
    run,
    executionPreset,
    workspaceScope,
    provider,
    modelLabel,
    usageSummary,
    routingBadge,
    registrySummary,
    agentContextSummary,
}: WorkspaceStatusPanelProps) {
    return (
        <section
            className={`grid gap-3 md:grid-cols-2 ${
                registrySummary || agentContextSummary ? 'xl:grid-cols-5' : 'xl:grid-cols-3'
            }`}>
            <StatusCard
                label='Run'
                value={run ? run.status : 'idle'}
                detail={run ? `${run.id}${run.errorMessage ? ` · ${run.errorMessage}` : ''}` : 'No run selected'}
            />
            <StatusCard
                label='Scope'
                value={
                    workspaceScope.kind === 'detached'
                        ? 'Detached'
                        : workspaceScope.kind === 'sandbox'
                          ? workspaceScope.label
                          : workspaceScope.label
                }
                detail={
                    workspaceScope.kind === 'detached'
                        ? `${executionPreset} preset · detached chat has no file authority`
                        : workspaceScope.kind === 'sandbox'
                          ? `${executionPreset} preset · managed sandbox · ${workspaceScope.absolutePath}`
                          : workspaceScope.executionEnvironmentMode === 'new_sandbox'
                            ? `${executionPreset} preset · queued managed sandbox from ${workspaceScope.absolutePath}`
                            : `${executionPreset} preset · local workspace · ${workspaceScope.absolutePath}`
                }
            />
            <StatusCard
                label='Target'
                value={modelLabel ?? provider?.label ?? 'Unresolved'}
                detail={
                    provider
                        ? `${provider.label} · ${provider.authState} via ${methodLabel(provider.authMethod)}${routingBadge ? ` · ${routingBadge}` : ''}`
                        : 'Select a runnable provider/model pair'
                }
            />
            <StatusCard
                label='Local Usage'
                value={usageSummary ? `${formatInteger(usageSummary.totalTokens)} tokens` : 'No usage'}
                detail={
                    usageSummary
                        ? `${formatInteger(usageSummary.runCount)} runs · ${formatMicrounits(usageSummary.totalCostMicrounits)}`
                        : 'No local telemetry for this provider yet'
                }
            />
            {agentContextSummary ? (
                <StatusCard
                    label='Agent Context'
                    value={agentContextSummary.modeLabel}
                    detail={`${formatInteger(agentContextSummary.rulesetCount)} rules · ${formatInteger(agentContextSummary.attachedRuleCount)} manual rules · ${formatInteger(agentContextSummary.attachedSkillCount)} attached skills`}
                />
            ) : null}
            {registrySummary ? (
                <StatusCard
                    label='Registry'
                    value={`${formatInteger(registrySummary.skillfiles)} skills`}
                    detail={`${formatInteger(registrySummary.modes)} modes · ${formatInteger(registrySummary.rulesets)} rules`}
                />
            ) : null}
        </section>
    );
}
