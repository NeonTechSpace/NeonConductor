import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import { resolveOpenAIBaseUrl } from '@/app/backend/providers/adapters/openai/endpoints';
import { KILO_GATEWAY_BASE_URL } from '@/app/backend/providers/kiloGatewayClient/constants';

const ZAI_CODING_BASE_URL = process.env['ZAI_CODING_BASE_URL']?.trim() || 'https://api.z.ai/api/coding/paas/v4';
const ZAI_GENERAL_BASE_URL = process.env['ZAI_GENERAL_BASE_URL']?.trim() || 'https://api.z.ai/api/paas/v4';
const MOONSHOT_STANDARD_BASE_URL =
    process.env['MOONSHOT_STANDARD_API_BASE_URL']?.trim() || 'https://api.moonshot.cn/v1';
const MOONSHOT_CODING_BASE_URL = process.env['MOONSHOT_CODING_BASE_URL']?.trim() || 'https://api.kimi.com/coding/v1';

export function resolveProviderBaseUrl(providerId: FirstPartyProviderId, endpointProfile: string): string | null {
    switch (providerId) {
        case 'kilo':
            return KILO_GATEWAY_BASE_URL;
        case 'zai':
            return endpointProfile === 'general_international' ? ZAI_GENERAL_BASE_URL : ZAI_CODING_BASE_URL;
        case 'moonshot':
            return endpointProfile === 'coding_plan' ? MOONSHOT_CODING_BASE_URL : MOONSHOT_STANDARD_BASE_URL;
        case 'openai':
            return resolveOpenAIBaseUrl();
        default:
            return null;
    }
}
