import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { summarizeSkillDynamicContext } from '@/web/lib/skillDynamicContextSummary';

import type {
    ModeDefinitionRecord,
    RulesetDefinitionRecord,
    SkillfileDefinitionRecord,
} from '@/app/backend/persistence/types';

type RegistryAsset = ModeDefinitionRecord | RulesetDefinitionRecord | SkillfileDefinitionRecord;

function previewMarkdown(markdown: string): string {
    const lines = markdown.replace(/\r\n?/g, '\n').trim().split('\n').slice(0, 6);
    return lines.join('\n').trim();
}

function formatScopeLabel(asset: RegistryAsset): string {
    const presetLabel =
        'presetKey' in asset && typeof asset.presetKey === 'string' && asset.presetKey.length > 0
            ? ` · ${asset.presetKey}`
            : '';
    return `${asset.scope}${presetLabel}`;
}

function isSkillAsset(asset: RegistryAsset): asset is SkillfileDefinitionRecord {
    return 'dynamicContextSources' in asset;
}

function SkillDynamicContextMeta({ asset }: { asset: SkillfileDefinitionRecord }) {
    const summary = summarizeSkillDynamicContext(asset.dynamicContextSources);
    if (summary.sourceCount === 0) {
        return null;
    }

    return (
        <>
            <span className='bg-primary/10 text-primary rounded-full px-2 py-1 font-medium'>
                {summary.sourceCount} dynamic source{summary.sourceCount === 1 ? '' : 's'}
            </span>
            {summary.unsafeCount > 0 ? (
                <span className='rounded-full bg-amber-500/10 px-2 py-1 font-medium text-amber-700 dark:text-amber-300'>
                    {summary.unsafeCount} unsafe
                </span>
            ) : null}
            {summary.invalidCount > 0 ? (
                <span className='rounded-full bg-rose-500/10 px-2 py-1 font-medium text-rose-700 dark:text-rose-300'>
                    {summary.invalidCount} invalid
                </span>
            ) : null}
        </>
    );
}

export function AssetMeta({ asset }: { asset: RegistryAsset }) {
    return (
        <div className='mt-2 flex flex-wrap gap-2 text-[11px]'>
            <span className='bg-background rounded-full px-2 py-1 font-medium'>{formatScopeLabel(asset)}</span>
            <span className='bg-background rounded-full px-2 py-1 font-medium'>{asset.sourceKind}</span>
            {'activationMode' in asset ? (
                <span className='bg-primary/10 text-primary rounded-full px-2 py-1 font-medium'>
                    {asset.activationMode}
                </span>
            ) : null}
            {asset.tags?.map((tag) => (
                <span
                    key={`${asset.id}:${tag}`}
                    className='bg-primary/10 text-primary rounded-full px-2 py-1 font-medium'>
                    {tag}
                </span>
            ))}
            {isSkillAsset(asset) ? <SkillDynamicContextMeta asset={asset} /> : null}
        </div>
    );
}

export function AssetCard({
    asset,
    title,
    subtitle,
    bodyMarkdown,
}: {
    asset: RegistryAsset;
    title: string;
    subtitle: string;
    bodyMarkdown: string;
}) {
    const preview = previewMarkdown(bodyMarkdown);

    return (
        <article className='border-border bg-card rounded-3xl border p-4 shadow-sm'>
            <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold'>{title}</p>
                    <p className='text-muted-foreground mt-1 text-xs'>{subtitle}</p>
                    {asset.description ? (
                        <p className='text-muted-foreground mt-2 text-xs'>{asset.description}</p>
                    ) : null}
                </div>
                <div className='text-right text-[11px] font-semibold'>
                    <p>{asset.enabled ? 'Enabled' : 'Disabled'}</p>
                    <p className='text-muted-foreground mt-1'>p{asset.precedence}</p>
                </div>
            </div>
            <AssetMeta asset={asset} />
            {preview.length > 0 ? (
                <div className='border-border bg-background/70 mt-3 rounded-2xl border p-3'>
                    <MarkdownContent markdown={preview} className='space-y-2' />
                </div>
            ) : null}
            {asset.originPath ? (
                <p className='text-muted-foreground bg-background/60 mt-3 rounded-xl px-3 py-2 text-[11px] break-all'>
                    {asset.originPath}
                </p>
            ) : null}
        </article>
    );
}

export function AssetSection<TAsset extends RegistryAsset>({
    title,
    emptyLabel,
    assets,
    renderTitle,
    renderSubtitle,
    renderBodyMarkdown,
}: {
    title: string;
    emptyLabel: string;
    assets: TAsset[];
    renderTitle: (asset: TAsset) => string;
    renderSubtitle: (asset: TAsset) => string;
    renderBodyMarkdown: (asset: TAsset) => string;
}) {
    return (
        <section className='space-y-3'>
            <div className='flex items-center justify-between gap-3'>
                <h4 className='text-sm font-semibold'>{title}</h4>
                <span className='text-muted-foreground text-xs'>{assets.length} items</span>
            </div>
            {assets.length > 0 ? (
                <div className='grid gap-3 xl:grid-cols-2'>
                    {assets.map((asset) => (
                        <AssetCard
                            key={asset.id}
                            asset={asset}
                            title={renderTitle(asset)}
                            subtitle={renderSubtitle(asset)}
                            bodyMarkdown={renderBodyMarkdown(asset)}
                        />
                    ))}
                </div>
            ) : (
                <p className='text-muted-foreground rounded-2xl border border-dashed px-4 py-5 text-sm'>{emptyLabel}</p>
            )}
        </section>
    );
}

export function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className='border-border bg-card rounded-2xl border px-4 py-3 shadow-sm'>
            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>{label}</p>
            <p className='mt-2 text-sm font-semibold'>{value}</p>
            <p className='text-muted-foreground mt-1 text-xs'>{detail}</p>
        </div>
    );
}
