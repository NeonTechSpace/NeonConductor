import type { SensitiveFieldCategory } from '@/web/lib/privacy/privacy';
import { usePrivacyMode } from '@/web/lib/privacy/privacyContext';
import { cn } from '@/web/lib/utils';

import type { ReactNode } from 'react';

interface SensitiveValueProps {
    value: string | null | undefined;
    category: SensitiveFieldCategory;
    fallback?: string;
    className?: string;
    redactedClassName?: string;
}

export function SensitiveValue({
    value,
    category,
    fallback = '-',
    className,
    redactedClassName,
}: SensitiveValueProps): ReactNode {
    const { enabled, redactValue } = usePrivacyMode();
    const normalizedValue = typeof value === 'string' ? value.trim() : '';

    if (normalizedValue.length === 0) {
        return <span className={className}>{fallback}</span>;
    }

    const displayValue = enabled ? redactValue(normalizedValue, category) : normalizedValue;

    return (
        <span
            className={cn(className, enabled ? 'privacy-redacted' : '', redactedClassName)}
            data-sensitive-category={category}>
            {displayValue}
        </span>
    );
}
