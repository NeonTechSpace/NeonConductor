import { cn } from '@/web/lib/utils';

interface SettingsFeedbackBannerProps {
    message: string | undefined;
    tone?: 'success' | 'error' | 'info';
    className?: string;
}

export function SettingsFeedbackBanner({ message, tone = 'info', className }: SettingsFeedbackBannerProps) {
    if (!message) {
        return null;
    }

    return (
        <div
            aria-live='polite'
            role={tone === 'error' ? 'alert' : 'status'}
            className={cn(
                'rounded-2xl border px-3 py-2 text-sm',
                tone === 'error' && 'border-destructive/30 bg-destructive/10 text-destructive',
                tone === 'success' && 'border-primary/20 bg-primary/10 text-primary',
                tone === 'info' && 'border-border bg-background/70 text-muted-foreground',
                className
            )}>
            {message}
        </div>
    );
}
