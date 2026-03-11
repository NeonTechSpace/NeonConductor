import { formatDateTime, formatInteger } from '@/web/components/settings/providerSettings/helpers';
import { KiloAccountSection } from '@/web/components/settings/providerSettings/kiloAccountSection';
import { useKiloAccountSettingsController } from '@/web/components/settings/hooks/useKiloAccountSettingsController';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SensitiveValue } from '@/web/components/ui/sensitiveValue';

import type { ReactNode } from 'react';

interface KiloSettingsViewProps {
    profileId: string;
}

function formatBalance(amount: number | undefined, currency: string | undefined): string {
    if (amount === undefined || !currency) {
        return '-';
    }

    return `${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ${currency}`;
}

function SummaryCard(input: { label: string; value: ReactNode; meta?: string }) {
    return (
        <article className='border-border/70 bg-background/80 rounded-[22px] border p-4'>
            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>{input.label}</p>
            <div className='mt-2 text-sm font-medium'>{input.value}</div>
            {input.meta ? <p className='text-muted-foreground mt-2 text-xs'>{input.meta}</p> : null}
        </article>
    );
}

export function KiloSettingsView({ profileId }: KiloSettingsViewProps) {
    const controller = useKiloAccountSettingsController(profileId);

    if (!controller.provider || controller.provider.id !== 'kilo') {
        return <p className='text-muted-foreground p-5 text-sm'>Kilo is not available for this profile.</p>;
    }

    const accountContext = controller.accountContext;
    const activeOrganization = accountContext?.organizations.find((organization) => organization.isActive);

    return (
        <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
            <div className='min-h-0 flex-1 overflow-y-auto p-5 md:p-6'>
                <div className='flex flex-col gap-5'>
                    <div className='space-y-2'>
                        <p className='text-primary text-[11px] font-semibold tracking-[0.18em] uppercase'>Kilo</p>
                        <div className='flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between'>
                            <div className='space-y-1'>
                                <h4 className='text-xl font-semibold text-balance'>Kilo account profile</h4>
                                <p className='text-muted-foreground max-w-3xl text-sm leading-6'>
                                    Review the synced Kilo identity, organization membership, and balance snapshots here.
                                    Provider login, default model selection, and routing stay in the Providers section.
                                </p>
                            </div>
                            <div className='border-border/70 bg-background/80 rounded-full border px-3 py-1.5 text-xs font-medium'>
                                Auth {controller.authState?.authState ?? controller.provider.authState}
                            </div>
                        </div>
                    </div>

                    <SettingsFeedbackBanner message={controller.feedbackMessage} tone={controller.feedbackTone} />

                    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
                        <SummaryCard
                            label='Account'
                            value={<SensitiveValue value={accountContext?.displayName} category='person' />}
                            meta={accountContext?.accountId ? `ID ${accountContext.accountId}` : 'No account linked yet'}
                        />
                        <SummaryCard
                            label='Email'
                            value={<SensitiveValue value={accountContext?.emailMasked} category='email' />}
                            meta={
                                controller.authState?.tokenExpiresAt
                                    ? `Token ${formatDateTime(controller.authState.tokenExpiresAt)}`
                                    : 'Token expiry unavailable'
                            }
                        />
                        <SummaryCard
                            label='Organization'
                            value={<SensitiveValue value={activeOrganization?.name} category='organization' />}
                            meta={`${formatInteger(accountContext?.organizations.length)} orgs available`}
                        />
                        <SummaryCard
                            label='Balance'
                            value={
                                <SensitiveValue
                                    value={formatBalance(accountContext?.balance?.amount, accountContext?.balance?.currency)}
                                    category='balance'
                                />
                            }
                            meta={
                                accountContext?.balance?.updatedAt
                                    ? `Updated ${formatDateTime(accountContext.balance.updatedAt)}`
                                    : 'No balance snapshot yet'
                            }
                        />
                    </div>

                    <div className='grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]'>
                        <div className='space-y-5'>
                            <KiloAccountSection
                                accountContext={accountContext}
                                isLoading={controller.isLoading}
                                isSavingOrganization={controller.isSavingOrganization}
                                onOrganizationChange={(organizationId) => {
                                    void controller.changeOrganization(organizationId);
                                }}
                            />
                        </div>

                        <div className='space-y-4'>
                            <SummaryCard
                                label='Session'
                                value={controller.authState?.authState ?? controller.provider.authState}
                                meta={
                                    controller.authState?.tokenExpiresAt
                                        ? `Token ${formatDateTime(controller.authState.tokenExpiresAt)}`
                                        : 'Provider login state is managed in Providers'
                                }
                            />
                            <SummaryCard
                                label='Active Org ID'
                                value={<SensitiveValue value={activeOrganization?.organizationId} category='account_id' />}
                                meta='Switch organizations from the Kilo organization panel.'
                            />
                            <SummaryCard
                                label='Email'
                                value={<SensitiveValue value={accountContext?.emailMasked} category='email' />}
                                meta='Identity data is synced from the Kilo account profile.'
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
