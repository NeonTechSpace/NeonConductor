import { Button } from '@/web/components/ui/button';
import { SensitiveValue } from '@/web/components/ui/sensitiveValue';
import { usePrivacyMode } from '@/web/lib/privacy/privacyContext';

import type { KiloAccountContext } from '@/app/backend/runtime/contracts';

interface KiloAccountSectionProps {
    accountContext: KiloAccountContext | undefined;
    isLoading: boolean;
    isSavingOrganization: boolean;
    onOrganizationChange: (organizationId?: string) => void;
}

function resolveActiveOrganizationId(accountContext: KiloAccountContext | undefined): string {
    const activeOrganization = accountContext?.organizations.find((organization) => organization.isActive);
    return activeOrganization?.organizationId ?? '';
}

export function KiloAccountSection({
    accountContext,
    isLoading,
    isSavingOrganization,
    onOrganizationChange,
}: KiloAccountSectionProps) {
    const { enabled, redactValue } = usePrivacyMode();

    if (isLoading) {
        return (
            <section className='space-y-2'>
                <p className='text-sm font-semibold'>Kilo Organization</p>
                <p className='text-muted-foreground text-xs'>Loading Kilo organization context...</p>
            </section>
        );
    }

    const activeOrganizationId = resolveActiveOrganizationId(accountContext);

    return (
        <section className='space-y-3'>
            <div>
                <p className='text-sm font-semibold'>Kilo Organization</p>
                <p className='text-muted-foreground text-xs'>
                    Change the active organization while keeping the provider status and balance snapshot above.
                </p>
            </div>

            <div className='border-border bg-background rounded-xl border p-4'>
                <p className='text-xs font-semibold tracking-[0.12em] uppercase'>Organization</p>
                <div className='mt-3 space-y-3'>
                    <label className='space-y-1'>
                        <span className='text-muted-foreground block text-xs'>Active organization</span>
                        <select
                            className='border-border bg-card h-10 w-full rounded-lg border px-3 text-sm'
                            value={activeOrganizationId}
                            disabled={isSavingOrganization || (accountContext?.organizations.length ?? 0) === 0}
                            onChange={(event) => {
                                const nextValue = event.target.value.trim();
                                onOrganizationChange(nextValue.length > 0 ? nextValue : undefined);
                            }}>
                            <option value=''>Account default</option>
                            {(accountContext?.organizations ?? []).map((organization) => (
                                <option key={organization.id} value={organization.organizationId}>
                                    {enabled ? redactValue(organization.name, 'organization') : organization.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className='space-y-2'>
                        {(accountContext?.organizations ?? []).map((organization) => (
                            <div
                                key={organization.id}
                                className={`rounded-lg border px-3 py-2 text-sm ${
                                    organization.isActive ? 'border-primary bg-primary/10' : 'border-border bg-card'
                                }`}>
                                <div className='flex items-center justify-between gap-3'>
                                    <SensitiveValue value={organization.name} category='organization' />
                                    {organization.isActive ? (
                                        <span className='text-primary text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                            Active
                                        </span>
                                    ) : null}
                                </div>
                                <p className='text-muted-foreground mt-1 text-xs'>
                                    <SensitiveValue value={organization.organizationId} category='account_id' />
                                </p>
                            </div>
                        ))}
                        {(accountContext?.organizations.length ?? 0) === 0 ? (
                            <p className='text-muted-foreground text-xs'>No organizations returned for this account yet.</p>
                        ) : null}
                    </div>

                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={isSavingOrganization}
                        onClick={() => {
                            onOrganizationChange(undefined);
                        }}>
                        Reset to account default
                    </Button>
                </div>
            </div>
        </section>
    );
}
