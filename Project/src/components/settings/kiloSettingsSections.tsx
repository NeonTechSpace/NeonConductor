import { ProviderAuthenticationSection } from '@/web/components/settings/providerSettings/authenticationSection';
import { ProviderDefaultModelSection } from '@/web/components/settings/providerSettings/defaultModelSection';
import { formatDateTime, formatInteger } from '@/web/components/settings/providerSettings/helpers';
import type { KiloSettingsControllerState } from '@/web/components/settings/providerSettings/hooks/useKiloSettingsController';
import { KiloAccountSection } from '@/web/components/settings/providerSettings/kiloAccountSection';
import { KiloRoutingSection } from '@/web/components/settings/providerSettings/kiloRoutingSection';
import { ProviderSpecialistDefaultsSection } from '@/web/components/settings/providerSettings/specialistDefaultsSection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { Button } from '@/web/components/ui/button';
import { SensitiveValue } from '@/web/components/ui/sensitiveValue';

import type { KiloCloudSessionPrerequisiteBlocker } from '@/shared/contracts';

function formatBalance(amount: number | undefined, currency: string | undefined): string {
    if (amount === undefined || !currency) {
        return '-';
    }

    return `${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ${currency}`;
}

function SummaryCard(input: {
    label: string;
    value: React.JSX.Element | string | number | null | undefined;
    meta?: string;
}) {
    return (
        <article className='border-border/70 bg-background/80 rounded-[22px] border p-4'>
            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>{input.label}</p>
            <div className='mt-2 text-sm font-medium'>{input.value}</div>
            {input.meta ? <p className='text-muted-foreground mt-2 text-xs'>{input.meta}</p> : null}
        </article>
    );
}

const cloudSessionBlockerCopy: Record<KiloCloudSessionPrerequisiteBlocker, string> = {
    auth_required: 'Sign in to Kilo before browsing cloud sessions.',
    credential_required: 'A stored Kilo credential is required for remote session access.',
    account_context_required: 'Refresh account context so Neon can resolve the remote account scope.',
    organization_unavailable: 'The selected organization is not present in the latest Kilo account snapshot.',
};

export function KiloCloudSessionReadinessSection({
    controller,
}: {
    controller: KiloSettingsControllerState;
}) {
    const prerequisites = controller.kilo.cloudSessionPrerequisites;
    const scope = prerequisites?.scope;
    const blockers = prerequisites?.blockers ?? [];

    return (
        <section className='border-border bg-background rounded-xl border p-4'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                    <p className='text-sm font-semibold'>Cloud Sessions</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Account readiness for future Kilo cloud-session browsing and continuation.
                    </p>
                </div>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={controller.kilo.isRefreshingAccountContext}
                    onClick={() => {
                        void controller.kilo.refreshAccountContext();
                    }}>
                    {controller.kilo.isRefreshingAccountContext ? 'Refreshing...' : 'Refresh'}
                </Button>
            </div>

            {controller.kilo.isLoadingCloudSessionPrerequisites ? (
                <p className='text-muted-foreground mt-4 text-xs'>Loading cloud-session readiness...</p>
            ) : (
                <div className='mt-4 grid gap-3 md:grid-cols-3'>
                    <SummaryCard
                        label='Readiness'
                        value={prerequisites?.canBrowseRemoteSessions ? 'Ready' : 'Blocked'}
                        meta={
                            prerequisites?.canContinueRemoteSessions
                                ? 'Browse and continue prerequisites are satisfied.'
                                : 'Resolve blockers before remote cloud-session actions.'
                        }
                    />
                    <SummaryCard
                        label='Credential'
                        value={prerequisites?.hasStoredCredential ? 'Available' : 'Missing'}
                        meta={`Auth ${prerequisites?.authState ?? controller.effectiveAuthState}`}
                    />
                    <SummaryCard
                        label='Remote Scope'
                        value={
                            scope?.scopeKind === 'organization' ? (
                                <SensitiveValue value={scope.organizationName} category='organization' />
                            ) : scope?.scopeKind === 'account' ? (
                                'Account'
                            ) : (
                                '-'
                            )
                        }
                        meta={scope?.remoteScopeKey ? `Key ${scope.remoteScopeKey}` : 'No remote scope resolved'}
                    />
                </div>
            )}

            {blockers.length > 0 ? (
                <div className='border-border bg-card mt-4 rounded-xl border p-3'>
                    <p className='text-xs font-semibold tracking-[0.12em] uppercase'>Blockers</p>
                    <ul className='text-muted-foreground mt-2 space-y-1 text-xs'>
                        {blockers.map((blocker) => (
                            <li key={blocker}>{cloudSessionBlockerCopy[blocker]}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}

export function KiloAccountAccessScreen({
    profileId,
    controller,
    selectedProvider,
}: {
    profileId: string;
    controller: KiloSettingsControllerState;
    selectedProvider: NonNullable<KiloSettingsControllerState['selectedProvider']>;
}) {
    const accountContext = controller.kilo.accountContext;
    const activeOrganization = accountContext?.organizations.find((organization) => organization.isActive);

    return (
        <div className='space-y-5'>
            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

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
                        controller.providerStatus.authState?.tokenExpiresAt
                            ? `Token ${formatDateTime(controller.providerStatus.authState.tokenExpiresAt)}`
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

            <ProviderAuthenticationSection
                key={`${profileId}:kilo`}
                selectedProviderId='kilo'
                selectedProviderAuthState={selectedProvider.authState}
                selectedProviderAuthMethod={selectedProvider.authMethod}
                selectedAuthState={controller.providerStatus.authState}
                methods={controller.authentication.methods}
                connectionProfileValue={selectedProvider.connectionProfile.optionProfileId}
                connectionProfileOptions={selectedProvider.connectionProfile.options}
                supportsCustomBaseUrl={selectedProvider.features.supportsCustomBaseUrl}
                baseUrlOverrideValue={selectedProvider.connectionProfile.baseUrlOverride ?? ''}
                resolvedBaseUrl={selectedProvider.connectionProfile.resolvedBaseUrl}
                executionPreference={undefined}
                apiKeyCta={selectedProvider.apiKeyCta}
                activeAuthFlow={controller.authentication.activeAuthFlow}
                isSavingApiKey={controller.authentication.isSavingApiKey}
                isSavingConnectionProfile={controller.authentication.isSavingConnectionProfile}
                isSavingExecutionPreference={false}
                isStartingAuth={controller.authentication.isStartingAuth}
                isPollingAuth={controller.authentication.isPollingAuth}
                isCancellingAuth={controller.authentication.isCancellingAuth}
                isOpeningVerificationPage={controller.authentication.isOpeningVerificationPage}
                onConnectionProfileChange={(value) => {
                    void controller.authentication.changeConnectionProfile(value);
                }}
                onExecutionPreferenceChange={() => {}}
                onSaveApiKey={(value) => controller.authentication.saveApiKey(value)}
                onSaveBaseUrlOverride={(value) => controller.authentication.saveBaseUrlOverride(value)}
                onLoadStoredCredential={() => controller.authentication.loadStoredCredential()}
                onStartOAuthDevice={() => {
                    void controller.authentication.startOAuthDevice();
                }}
                onStartDeviceCode={() => {
                    void controller.authentication.startDeviceCode();
                }}
                onPollNow={() => {
                    void controller.authentication.pollNow();
                }}
                onCancelFlow={() => {
                    void controller.authentication.cancelFlow();
                }}
                onOpenVerificationPage={() => {
                    void controller.authentication.openVerificationPage();
                }}
                {...(controller.authentication.credentialSummary
                    ? { credentialSummary: controller.authentication.credentialSummary }
                    : {})}
            />

            <div className='grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]'>
                <div className='space-y-5'>
                    <KiloAccountSection
                        accountContext={controller.kilo.accountContext}
                        isLoading={controller.providerStatus.isLoadingAccountContext}
                        isSavingOrganization={controller.kilo.isSavingOrganization}
                        onOrganizationChange={(value) => {
                            void controller.kilo.changeOrganization(value);
                        }}
                    />
                    <KiloCloudSessionReadinessSection controller={controller} />
                </div>

                <div className='space-y-4'>
                    <SummaryCard
                        label='Session'
                        value={controller.effectiveAuthState}
                        meta={
                            controller.providerStatus.authState?.tokenExpiresAt
                                ? `Token ${formatDateTime(controller.providerStatus.authState.tokenExpiresAt)}`
                                : 'Browser sign-in is the recommended Kilo flow.'
                        }
                    />
                    <SummaryCard
                        label='Active Org ID'
                        value={<SensitiveValue value={activeOrganization?.organizationId} category='account_id' />}
                        meta='Switch organizations from the Kilo organization panel.'
                    />
                </div>
            </div>
        </div>
    );
}

export function KiloGatewayModelsScreen({
    profileId,
    controller,
}: {
    profileId: string;
    controller: KiloSettingsControllerState;
}) {
    return (
        <div className='space-y-5'>
            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <ProviderSpecialistDefaultsSection profileId={profileId} />

            <ProviderDefaultModelSection
                selectedProviderId='kilo'
                selectedModelId={controller.models.selectedModelId}
                models={controller.models.options}
                catalogStateReason={controller.models.catalogStateReason}
                {...(controller.models.catalogStateDetail
                    ? { catalogStateDetail: controller.models.catalogStateDetail }
                    : {})}
                isDefaultModel={controller.models.isDefaultModel}
                isSavingDefault={controller.models.isSavingDefault}
                isSyncingCatalog={controller.models.isSyncingCatalog}
                onSelectModel={(modelId) => {
                    controller.models.setSelectedModelId(modelId);
                    if (modelId === controller.models.selectedModelId && controller.models.isDefaultModel) {
                        return;
                    }

                    void controller.models.setDefaultModel(modelId);
                }}
                onSyncCatalog={() => {
                    void controller.models.syncCatalog();
                }}
            />
        </div>
    );
}

export function KiloRoutingScreen({ controller }: { controller: KiloSettingsControllerState }) {
    const shouldShowRoutingSection =
        controller.selectedProvider?.features.supportsKiloRouting === true &&
        controller.models.selectedModelId.trim().length > 0 &&
        Boolean(controller.kilo.routingDraft) &&
        controller.kilo.modelProviders.length > 1;

    return (
        <div className='space-y-5'>
            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <ProviderDefaultModelSection
                selectedProviderId='kilo'
                selectedModelId={controller.models.selectedModelId}
                models={controller.models.options}
                catalogStateReason={controller.models.catalogStateReason}
                {...(controller.models.catalogStateDetail
                    ? { catalogStateDetail: controller.models.catalogStateDetail }
                    : {})}
                isDefaultModel={controller.models.isDefaultModel}
                isSavingDefault={controller.models.isSavingDefault}
                isSyncingCatalog={controller.models.isSyncingCatalog}
                onSelectModel={(modelId) => {
                    controller.models.setSelectedModelId(modelId);
                    if (modelId === controller.models.selectedModelId && controller.models.isDefaultModel) {
                        return;
                    }

                    void controller.models.setDefaultModel(modelId);
                }}
                onSyncCatalog={() => {
                    void controller.models.syncCatalog();
                }}
            />

            {shouldShowRoutingSection && controller.kilo.routingDraft ? (
                <KiloRoutingSection
                    selectedModelId={controller.models.selectedModelId}
                    draft={controller.kilo.routingDraft}
                    providers={controller.kilo.modelProviders}
                    isLoadingPreference={controller.kilo.isLoadingRoutingPreference}
                    isLoadingProviders={controller.kilo.isLoadingModelProviders}
                    isSaving={controller.kilo.isSavingRoutingPreference}
                    onModeChange={(value) => {
                        void controller.kilo.changeRoutingMode(value);
                    }}
                    onSortChange={(value) => {
                        void controller.kilo.changeRoutingSort(value);
                    }}
                    onPinnedProviderChange={(value) => {
                        void controller.kilo.changePinnedProvider(value);
                    }}
                />
            ) : (
                <div className='border-border/70 bg-card/40 rounded-[24px] border p-5'>
                    <p className='text-sm font-semibold'>Routing is not configurable yet</p>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                        Choose a Kilo model that exposes multiple upstream providers before advanced routing controls
                        become available here.
                    </p>
                </div>
            )}
        </div>
    );
}
