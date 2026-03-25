import { providerStore, runStore, settingsStore, threadStore } from '@/app/backend/persistence/stores';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import { isSupportedProviderId } from '@/app/backend/providers/registry';
import type { ProviderRuntimeInput, ProviderRuntimePart } from '@/app/backend/providers/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { resolveRuntimeProtocol } from '@/app/backend/runtime/services/runExecution/protocol';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
import { appLog } from '@/app/main/logging';

const TITLE_GENERATION_MODE_KEY = 'thread_title_generation_mode';
const TITLE_AI_MODEL_KEY = 'thread_title_ai_model';
const TITLE_AI_MODE = 'ai_optional';
const DEFAULT_TITLE_MODE = 'template';

function providerLabel(providerId: RuntimeProviderId): string {
    if (providerId === 'openai') {
        return 'OpenAI';
    }
    if (providerId === 'zai') {
        return 'Z.AI';
    }
    if (providerId === 'moonshot') {
        return 'Moonshot';
    }

    return 'Kilo';
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
    const normalized = normalizeWhitespace(value);
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function sanitizeTitle(value: string): string {
    const singleLine = value.replace(/\r?\n/g, ' ').replace(/^["'`\s]+|["'`\s]+$/g, '');
    return truncate(singleLine, 90);
}

function parseRuntimeTextPart(part: ProviderRuntimePart): string | undefined {
    if (part.partType !== 'text' && part.partType !== 'reasoning_summary') {
        return undefined;
    }
    const value = part.payload['text'];
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function inferProviderIdFromModel(modelId: string): RuntimeProviderId | null {
    const normalized = modelId.trim().toLowerCase();
    const providerPrefix = normalized.split('/')[0];
    if (providerPrefix && isSupportedProviderId(providerPrefix)) {
        return providerPrefix;
    }

    return null;
}

function shouldRetitleThread(input: { title: string; runCount: number; parentThreadId?: string }): boolean {
    if (input.title.startsWith('New ')) {
        return true;
    }
    if (input.parentThreadId && input.title.endsWith('(Branch)')) {
        return true;
    }
    return false;
}

function createTitleContextMessage(
    role: 'system' | 'user' | 'assistant',
    text: string
): NonNullable<ProviderRuntimeInput['contextMessages']>[number] {
    return {
        role,
        parts: [
            {
                type: 'text',
                text,
            },
        ],
    };
}

interface ApplyThreadTitleInput {
    profileId: string;
    sessionId: string;
    prompt: string;
    providerId: RuntimeProviderId;
    modelId: string;
}

async function buildTemplateTitle(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    prompt: string;
}): Promise<string> {
    const models = await providerStore.listModels(input.profileId, input.providerId);
    const modelLabel = models.find((model) => model.id === input.modelId)?.label ?? input.modelId;
    const excerpt = truncate(input.prompt, 64);
    return sanitizeTitle(`${providerLabel(input.providerId)} · ${modelLabel} — ${excerpt}`);
}

async function generateAiTitle(input: {
    profileId: string;
    aiModel: string;
    prompt: string;
    templateTitle: string;
}): Promise<string | undefined> {
    const providerId = inferProviderIdFromModel(input.aiModel);
    if (!providerId) {
        return undefined;
    }
    const modelExists = await providerStore.modelExists(input.profileId, providerId, input.aiModel);
    if (!modelExists) {
        return undefined;
    }

    const auth = await resolveRunAuth({
        profileId: input.profileId,
        providerId,
    });
    if (auth.isErr()) {
        return undefined;
    }

    const modelCapabilities = await providerStore.getModelCapabilities(input.profileId, providerId, input.aiModel);
    if (!modelCapabilities) {
        return undefined;
    }

    const runtimeProtocol = await resolveRuntimeProtocol({
        profileId: input.profileId,
        providerId,
        modelId: input.aiModel,
        modelCapabilities,
        authMethod: auth.value.authMethod,
        runtimeOptions: {
            reasoning: {
                effort: 'none',
                summary: 'none',
                includeEncrypted: false,
            },
            cache: {
                strategy: 'auto',
            },
            transport: {
                family: 'auto',
            },
        },
    });
    if (runtimeProtocol.isErr()) {
        return undefined;
    }

    const adapter = getProviderAdapter(providerId);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, 10_000);

    const chunks: string[] = [];
    try {
        const runtimeInput: ProviderRuntimeInput = {
            profileId: input.profileId,
            sessionId: 'sess_title_generation',
            runId: 'run_title_generation',
            providerId,
            modelId: input.aiModel,
            runtime: runtimeProtocol.value.runtime,
            promptText:
                'Return a concise thread title (max 70 chars) based on the user request. Return title text only.',
            contextMessages: [
                createTitleContextMessage(
                    'system',
                    'You produce short, clear conversation thread titles. Output plain text only.'
                ),
                createTitleContextMessage('user', `Request: ${input.prompt}\nTemplate: ${input.templateTitle}`),
            ],
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
                execution: {},
            },
            cache: {
                strategy: 'auto',
                applied: false,
            },
            authMethod: auth.value.authMethod,
            ...(auth.value.apiKey ? { apiKey: auth.value.apiKey } : {}),
            ...(auth.value.accessToken ? { accessToken: auth.value.accessToken } : {}),
            ...(auth.value.organizationId ? { organizationId: auth.value.organizationId } : {}),
            signal: controller.signal,
        };
        const streamResult = await adapter.streamCompletion(runtimeInput, {
            onPart: (part) => {
                const text = parseRuntimeTextPart(part);
                if (text) {
                    chunks.push(text);
                }
            },
        });
        if (streamResult.isErr()) {
            return undefined;
        }
    } catch {
        return undefined;
    } finally {
        clearTimeout(timeout);
    }

    const candidate = sanitizeTitle(chunks.join(' '));
    if (candidate.length < 3) {
        return undefined;
    }
    return candidate;
}

class ThreadTitleService {
    async maybeApply(input: ApplyThreadTitleInput): Promise<void> {
        try {
            const [sessionThread, modelExists, modeRaw, aiModelRaw] = await Promise.all([
                threadStore.getBySessionId(input.profileId, input.sessionId),
                providerStore.modelExists(input.profileId, input.providerId, input.modelId),
                settingsStore.getStringOptional(input.profileId, TITLE_GENERATION_MODE_KEY),
                settingsStore.getStringOptional(input.profileId, TITLE_AI_MODEL_KEY),
            ]);
            if (!sessionThread) {
                return;
            }
            if (!modelExists) {
                return;
            }

            const allRuns = await runStore.listBySession(input.profileId, input.sessionId);

            if (
                !shouldRetitleThread({
                    title: sessionThread.thread.title,
                    runCount: allRuns.length,
                    ...(sessionThread.thread.parentThreadId
                        ? { parentThreadId: sessionThread.thread.parentThreadId }
                        : {}),
                })
            ) {
                return;
            }

            const templateTitle = await buildTemplateTitle({
                profileId: input.profileId,
                providerId: input.providerId,
                modelId: input.modelId,
                prompt: input.prompt,
            });
            const renamedTemplate = await threadStore.rename(input.profileId, sessionThread.thread.id, templateTitle);
            if (renamedTemplate.isErr()) {
                return;
            }

            const mode = modeRaw === TITLE_AI_MODE ? TITLE_AI_MODE : DEFAULT_TITLE_MODE;
            const aiModel = aiModelRaw?.trim();
            if (mode !== TITLE_AI_MODE || !aiModel) {
                return;
            }
            const aiTitle = await generateAiTitle({
                profileId: input.profileId,
                aiModel,
                prompt: input.prompt,
                templateTitle,
            });
            if (!aiTitle) {
                return;
            }
            const renamedAi = await threadStore.rename(input.profileId, sessionThread.thread.id, aiTitle);
            if (renamedAi.isErr()) {
                return;
            }
        } catch (error) {
            appLog.warn({
                tag: 'thread-title',
                message: 'Failed to apply automatic thread title.',
                profileId: input.profileId,
                sessionId: input.sessionId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}

export const threadTitleService = new ThreadTitleService();
