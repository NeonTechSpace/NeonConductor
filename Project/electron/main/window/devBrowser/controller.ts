import { BrowserWindow, WebContentsView } from 'electron';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { conversationAttachmentStore, threadStore, workspaceRootStore } from '@/app/backend/persistence/stores';
import type {
    BrowserSelectionReactEnrichment,
    BrowserSelectionSnapshotInput,
    DevBrowserTarget,
    DevBrowserValidatedTargetBinding,
    DevBrowserValidationSource,
} from '@/app/backend/runtime/contracts';
import { eventMetadata } from '@/app/backend/runtime/services/common/logContext';
import {
    normalizeDevBrowserTargetDraft,
    validateLocalDevBrowserTarget,
} from '@/app/backend/runtime/services/devBrowser/localTargetPolicy';
import { sessionDevBrowserService } from '@/app/backend/runtime/services/devBrowser/service';
import { runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { appLog } from '@/app/main/logging';
import { resolveDevBrowserViewPreloadPath } from '@/app/main/window/preloadPaths';
import type {
    DevBrowserDesignerPreviewPayload,
    DevBrowserMountPayload,
    DevBrowserSelectionPayload,
} from '@/app/shared/desktopBridgeContract';
import { DEV_BROWSER_DESIGNER_PREVIEW_CHANNEL, DEV_BROWSER_PICKER_CHANNEL } from '@/app/shared/desktopBridgeContract';

import type { EntityId } from '@/shared/contracts';

function roundBounds(input: Pick<DevBrowserMountPayload, 'x' | 'y' | 'width' | 'height'>) {
    return {
        x: Math.max(0, Math.round(input.x)),
        y: Math.max(0, Math.round(input.y)),
        width: Math.max(0, Math.round(input.width)),
        height: Math.max(0, Math.round(input.height)),
    };
}

function toTargetFromUrl(url: string, sourceKind: DevBrowserTarget['sourceKind']): DevBrowserTarget | null {
    try {
        const parsed = new URL(url);
        return {
            scheme: parsed.protocol === 'https:' ? 'https' : 'http',
            host: parsed.hostname,
            ...(parsed.port ? { port: Number.parseInt(parsed.port, 10) } : {}),
            path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
            sourceKind,
            validation: {
                status: 'blocked',
                resolvedAddresses: [],
            },
            browserAvailability: 'available',
        };
    } catch {
        return null;
    }
}

function normalizeRawSourcePath(rawPath: string): string | null {
    const trimmed = rawPath.trim();
    if (trimmed.length === 0) {
        return null;
    }
    if (trimmed.startsWith('file://')) {
        try {
            const pathname = new URL(trimmed).pathname;
            const normalizedPath =
                process.platform === 'win32' && /^\/[A-Za-z]:/.test(pathname) ? pathname.slice(1) : pathname;
            return path.normalize(normalizedPath);
        } catch {
            return null;
        }
    }
    if (path.isAbsolute(trimmed)) {
        return path.normalize(trimmed);
    }
    return trimmed;
}

function isWithinWorkspaceRoot(candidatePath: string, workspaceRoot: string): boolean {
    const relativePath = path.relative(workspaceRoot, candidatePath);
    return relativePath.length === 0 || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export interface DevBrowserWindowControllerOptions {
    isDev: boolean;
    mainDirname: string;
}

export class DevBrowserWindowController {
    private readonly window: BrowserWindow;
    private readonly options: DevBrowserWindowControllerOptions;
    private view: WebContentsView | null = null;
    private mountState: DevBrowserMountPayload | null = null;
    private boundProfileId: string | null = null;
    private boundSessionId: EntityId<'sess'> | null = null;
    private allowedNavigationBinding: DevBrowserValidatedTargetBinding | null = null;
    private syncingObservedTarget = false;

    constructor(window: BrowserWindow, options: DevBrowserWindowControllerOptions) {
        this.window = window;
        this.options = options;
    }

    getViewWebContentsId(): number | null {
        return this.view?.webContents.id ?? null;
    }

    private ensureView(): WebContentsView {
        if (this.view) {
            return this.view;
        }

        const view = new WebContentsView({
            webPreferences: {
                preload: resolveDevBrowserViewPreloadPath(this.options.mainDirname),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                devTools: this.options.isDev,
                partition: `persist:neonconductor-dev-browser-window-${String(this.window.id)}`,
            },
        });
        view.setVisible(false);
        view.setBackgroundColor('#0b1220');
        this.window.contentView.addChildView(view);
        this.view = view;
        this.attachViewEventHandlers(view);
        return view;
    }

    private attachViewEventHandlers(view: WebContentsView): void {
        view.webContents.setWindowOpenHandler((details) => {
            void this.persistBlockedNavigation(
                details.url,
                'popup',
                'popup_blocked',
                'Popup windows are blocked in the dev browser.'
            );
            return { action: 'deny' };
        });

        view.webContents.on('will-navigate', (event, url) => {
            if (this.consumeAllowedNavigation(url)) {
                return;
            }
            event.preventDefault();
            void this.handleRequestedNavigation(url, 'navigation');
        });

        view.webContents.on('will-redirect', (event, url) => {
            if (this.consumeAllowedNavigation(url)) {
                return;
            }
            event.preventDefault();
            void this.handleRequestedNavigation(url, 'redirect');
        });

        const syncCurrentPage = () => {
            void this.syncObservedTargetFromWebContents();
        };

        view.webContents.on('did-navigate', syncCurrentPage);
        view.webContents.on('did-navigate-in-page', syncCurrentPage);
        view.webContents.on('did-start-loading', syncCurrentPage);
        view.webContents.on('did-stop-loading', syncCurrentPage);
        view.webContents.on('page-title-updated', (event) => {
            event.preventDefault();
            void this.syncObservedTargetFromWebContents();
        });
    }

    private consumeAllowedNavigation(url: string): boolean {
        if (!this.allowedNavigationBinding) {
            return false;
        }
        try {
            const normalizedUrl = new URL(url).toString();
            if (normalizedUrl === this.allowedNavigationBinding.normalizedUrl) {
                this.allowedNavigationBinding = null;
                return true;
            }
        } catch {
            return false;
        }
        return false;
    }

    private loadValidatedNavigationBinding(binding: DevBrowserValidatedTargetBinding): void {
        this.allowedNavigationBinding = binding;
        void this.ensureView().webContents.loadURL(binding.normalizedUrl);
    }

    private async persistBlockedNavigation(
        url: string,
        source: DevBrowserValidationSource,
        code: NonNullable<DevBrowserTarget['validation']['blockedReasonCode']>,
        message: string
    ): Promise<void> {
        if (!this.boundProfileId || !this.boundSessionId) {
            return;
        }
        const state = await sessionDevBrowserService.getState(this.boundProfileId, this.boundSessionId);
        if (!state.target) {
            return;
        }
        await sessionDevBrowserService.syncObservedTarget({
            profileId: this.boundProfileId,
            sessionId: this.boundSessionId,
            target: {
                ...state.target,
                browserAvailability: 'available',
                validation: {
                    status: 'blocked',
                    normalizedUrl: url,
                    resolvedAddresses: state.target.validation.resolvedAddresses,
                    blockedReasonCode: code,
                    blockedReasonMessage: message,
                    attemptedUrl: url,
                    source,
                },
            },
        });
        await this.emitSessionBrowserEvent('navigation_blocked');
    }

    private async handleRequestedNavigation(url: string, source: DevBrowserValidationSource): Promise<void> {
        if (!this.boundProfileId || !this.boundSessionId) {
            return;
        }

        const state = await sessionDevBrowserService.getState(this.boundProfileId, this.boundSessionId);
        const currentTarget = state.target ?? toTargetFromUrl(url, 'manual');
        if (!currentTarget) {
            return;
        }

        const normalizedDraft = normalizeDevBrowserTargetDraft({
            scheme: currentTarget.scheme,
            host: currentTarget.host,
            ...(currentTarget.port !== undefined ? { port: currentTarget.port } : {}),
            path: new URL(url).pathname + new URL(url).search + new URL(url).hash,
            sourceKind: currentTarget.sourceKind,
        });
        const validation = validateLocalDevBrowserTarget({
            target: normalizedDraft,
            source,
        });
        const nextTarget: DevBrowserTarget = {
            ...normalizedDraft,
            validation,
            browserAvailability: 'available',
            ...(state.target?.currentPage ? { currentPage: state.target.currentPage } : {}),
        };
        await sessionDevBrowserService.syncObservedTarget({
            profileId: this.boundProfileId,
            sessionId: this.boundSessionId,
            target: nextTarget,
        });
        await this.emitSessionBrowserEvent(
            validation.status === 'allowed' ? 'navigation_allowed' : 'navigation_blocked'
        );

        if (validation.status !== 'allowed' || !validation.binding) {
            return;
        }

        this.loadValidatedNavigationBinding(validation.binding);
    }

    private async syncObservedTargetFromWebContents(): Promise<void> {
        if (this.syncingObservedTarget || !this.boundProfileId || !this.boundSessionId || !this.view) {
            return;
        }

        this.syncingObservedTarget = true;
        try {
            const currentUrl = this.view.webContents.getURL();
            const existingState = await sessionDevBrowserService.getState(this.boundProfileId, this.boundSessionId);
            const existingTarget = existingState.target ?? (currentUrl ? toTargetFromUrl(currentUrl, 'manual') : null);
            if (!existingTarget) {
                return;
            }

            const normalizedDraft = normalizeDevBrowserTargetDraft({
                scheme: existingTarget.scheme,
                host: existingTarget.host,
                ...(existingTarget.port !== undefined ? { port: existingTarget.port } : {}),
                path: existingTarget.path,
                sourceKind: existingTarget.sourceKind,
            });
            const validation = validateLocalDevBrowserTarget({
                target: normalizedDraft,
                source: 'navigation',
            });

            const currentPage =
                currentUrl.trim().length > 0
                    ? {
                          url: currentUrl,
                          pageIdentity: (() => {
                              const parsed = new URL(currentUrl);
                              return `${parsed.origin}${parsed.pathname}${parsed.search}`;
                          })(),
                          ...(this.view.webContents.getTitle().trim().length > 0
                              ? { title: this.view.webContents.getTitle().trim() }
                              : {}),
                          isLoading: this.view.webContents.isLoading(),
                          canGoBack: this.view.webContents.navigationHistory.canGoBack(),
                          canGoForward: this.view.webContents.navigationHistory.canGoForward(),
                      }
                    : undefined;
            const nextTarget: DevBrowserTarget = {
                ...normalizedDraft,
                validation,
                browserAvailability: 'available',
                ...(currentPage ? { currentPage } : {}),
            };

            await sessionDevBrowserService.syncObservedTarget({
                profileId: this.boundProfileId,
                sessionId: this.boundSessionId,
                target: nextTarget,
            });
            if (currentPage) {
                await sessionDevBrowserService.markStaleForCurrentPage({
                    profileId: this.boundProfileId,
                    sessionId: this.boundSessionId,
                    activePageIdentity: currentPage.pageIdentity,
                });
            }
            await this.syncDesignerPreviewState(this.boundProfileId, this.boundSessionId);
            await this.emitSessionBrowserEvent('page_state_updated');
        } finally {
            this.syncingObservedTarget = false;
        }
    }

    private async emitSessionBrowserEvent(reason: string): Promise<void> {
        if (!this.boundProfileId || !this.boundSessionId) {
            return;
        }
        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'session',
                domain: 'session',
                entityId: this.boundSessionId,
                eventType: 'session.dev_browser.updated',
                payload: {
                    profileId: this.boundProfileId,
                    sessionId: this.boundSessionId,
                    reason,
                },
                ...eventMetadata({
                    origin: 'main.devBrowser',
                }),
            })
        );
    }

    async syncMount(payload: DevBrowserMountPayload): Promise<void> {
        this.mountState = payload;
        this.boundProfileId = payload.profileId;
        this.boundSessionId = payload.sessionId as EntityId<'sess'>;

        const view = this.ensureView();
        const bounds = roundBounds(payload);
        view.setBounds(bounds);
        view.setVisible(payload.visible);

        if (!payload.visible) {
            const state = await sessionDevBrowserService.getState(payload.profileId, this.boundSessionId);
            if (state.target) {
                await sessionDevBrowserService.syncObservedTarget({
                    profileId: payload.profileId,
                    sessionId: this.boundSessionId,
                    target: {
                        ...state.target,
                        browserAvailability: 'unavailable',
                    },
                });
                await this.emitSessionBrowserEvent('mount_hidden');
            }
            return;
        }

        const state = await sessionDevBrowserService.getState(payload.profileId, this.boundSessionId);
        if (state.target) {
            await sessionDevBrowserService.syncObservedTarget({
                profileId: payload.profileId,
                sessionId: this.boundSessionId,
                target: {
                    ...state.target,
                    browserAvailability: 'available',
                },
            });
            if (state.target.validation.status === 'allowed' && state.target.validation.binding) {
                this.allowedNavigationBinding = state.target.validation.binding;
                void view.webContents.loadURL(state.target.validation.binding.normalizedUrl);
            }
        }
        this.setPickerActive(state.pickerActive);
        await this.emitSessionBrowserEvent('mount_visible');
    }

    async navigateToTarget(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        target: DevBrowserTarget;
    }): Promise<void> {
        if (!this.boundSessionId || !this.boundProfileId) {
            return;
        }
        if (input.profileId !== this.boundProfileId || input.sessionId !== this.boundSessionId) {
            return;
        }
        if (!this.mountState?.visible) {
            return;
        }
        if (input.target.validation.status !== 'allowed' || !input.target.validation.binding) {
            return;
        }

        const view = this.ensureView();
        this.allowedNavigationBinding = input.target.validation.binding;
        await sessionDevBrowserService.syncObservedTarget({
            ...input,
            target: {
                ...input.target,
                browserAvailability: 'available',
            },
        });
        void view.webContents.loadURL(input.target.validation.binding.normalizedUrl);
    }

    control(action: 'back' | 'forward' | 'reload'): void {
        if (!this.view) {
            return;
        }
        if (action === 'back' && this.view.webContents.navigationHistory.canGoBack()) {
            this.view.webContents.navigationHistory.goBack();
            return;
        }
        if (action === 'forward' && this.view.webContents.navigationHistory.canGoForward()) {
            this.view.webContents.navigationHistory.goForward();
            return;
        }
        if (action === 'reload') {
            this.view.webContents.reload();
        }
    }

    setPickerActive(active: boolean): void {
        if (!this.view) {
            return;
        }
        this.view.webContents.send(DEV_BROWSER_PICKER_CHANNEL, { active });
    }

    async syncDesignerPreviewState(profileId: string, sessionId: EntityId<'sess'>): Promise<void> {
        if (!this.view || profileId !== this.boundProfileId || sessionId !== this.boundSessionId) {
            return;
        }
        const state = await sessionDevBrowserService.getState(profileId, sessionId);
        const selectionById = new Map(state.selections.map((selection) => [selection.id, selection]));
        const payload: DevBrowserDesignerPreviewPayload = {
            drafts: state.designerDrafts
                .filter((draft) => draft.inclusionState === 'included' && !draft.stale)
                .flatMap((draft) => {
                    const selection = selectionById.get(draft.selectionId);
                    if (!selection || selection.stale) {
                        return [];
                    }
                    return [
                        {
                            draftId: draft.id,
                            selector: selection.selector,
                            stylePatches: draft.stylePatches,
                            ...(draft.textContentOverride ? { textContentOverride: draft.textContentOverride } : {}),
                            active: true,
                        },
                    ];
                }),
        };
        this.view.webContents.send(DEV_BROWSER_DESIGNER_PREVIEW_CHANNEL, payload);
    }

    private async sanitizeReactEnrichment(
        rawEnrichment: DevBrowserSelectionPayload['reactEnrichment']
    ): Promise<BrowserSelectionReactEnrichment | undefined> {
        if (
            !rawEnrichment ||
            rawEnrichment.componentChain.length === 0 ||
            !this.boundProfileId ||
            !this.boundSessionId
        ) {
            return undefined;
        }

        const sessionThread = await threadStore.getBySessionId(this.boundProfileId, this.boundSessionId);
        const workspaceFingerprint = sessionThread?.workspaceFingerprint;
        const normalizedRawSourcePath = rawEnrichment.sourceAnchor?.absolutePath
            ? normalizeRawSourcePath(rawEnrichment.sourceAnchor.absolutePath)
            : null;

        let sourceAnchor: BrowserSelectionReactEnrichment['sourceAnchor'] | undefined;
        if (normalizedRawSourcePath && workspaceFingerprint) {
            const workspaceRoot = await workspaceRootStore.getByFingerprint(this.boundProfileId, workspaceFingerprint);
            if (workspaceRoot) {
                const absolutePath = path.isAbsolute(normalizedRawSourcePath)
                    ? normalizedRawSourcePath
                    : path.resolve(workspaceRoot.absolutePath, normalizedRawSourcePath);
                if (isWithinWorkspaceRoot(absolutePath, workspaceRoot.absolutePath)) {
                    const relativePath = path.relative(workspaceRoot.absolutePath, absolutePath);
                    sourceAnchor = {
                        status: 'workspace_relative',
                        displayPath: relativePath,
                        workspaceFingerprint,
                        relativePath,
                        ...(rawEnrichment.sourceAnchor?.line ? { line: rawEnrichment.sourceAnchor.line } : {}),
                        ...(rawEnrichment.sourceAnchor?.column ? { column: rawEnrichment.sourceAnchor.column } : {}),
                    };
                } else {
                    sourceAnchor = {
                        status: 'outside_current_workspace',
                        displayPath:
                            rawEnrichment.sourceAnchor?.displayPath?.trim() ||
                            path.basename(absolutePath) ||
                            'outside_current_workspace',
                        ...(rawEnrichment.sourceAnchor?.line ? { line: rawEnrichment.sourceAnchor.line } : {}),
                        ...(rawEnrichment.sourceAnchor?.column ? { column: rawEnrichment.sourceAnchor.column } : {}),
                    };
                }
            }
        } else if (rawEnrichment.sourceAnchor) {
            sourceAnchor = {
                status: 'unresolved',
                displayPath:
                    rawEnrichment.sourceAnchor.displayPath?.trim() ||
                    (normalizedRawSourcePath ? path.basename(normalizedRawSourcePath) : 'unresolved'),
                ...(rawEnrichment.sourceAnchor.line ? { line: rawEnrichment.sourceAnchor.line } : {}),
                ...(rawEnrichment.sourceAnchor.column ? { column: rawEnrichment.sourceAnchor.column } : {}),
            };
        }

        return {
            sourceKind: rawEnrichment.sourceKind,
            componentChain: rawEnrichment.componentChain,
            ...(sourceAnchor ? { sourceAnchor } : {}),
        };
    }

    async handleSelectionPayload(payload: DevBrowserSelectionPayload): Promise<void> {
        if (!this.boundProfileId || !this.boundSessionId || !this.view) {
            return;
        }

        const cropAttachmentId = await this.captureSelectionCrop(payload.bounds);
        const reactEnrichment = await this.sanitizeReactEnrichment(payload.reactEnrichment);
        const selection: BrowserSelectionSnapshotInput = {
            pageIdentity: payload.pageIdentity,
            pageUrl: payload.pageUrl,
            ...(payload.pageTitle ? { pageTitle: payload.pageTitle } : {}),
            selector: payload.selector,
            ancestryTrail: payload.ancestryTrail,
            ...(payload.accessibleLabel ? { accessibleLabel: payload.accessibleLabel } : {}),
            ...(payload.accessibleRole ? { accessibleRole: payload.accessibleRole } : {}),
            ...(payload.textExcerpt ? { textExcerpt: payload.textExcerpt } : {}),
            bounds: payload.bounds,
            ...(cropAttachmentId ? { cropAttachmentId } : {}),
            enrichmentMode: reactEnrichment?.sourceAnchor
                ? 'react_source_enriched'
                : reactEnrichment
                  ? 'react_component_enriched'
                  : 'dom_only',
            ...(reactEnrichment ? { reactEnrichment } : {}),
        };
        await sessionDevBrowserService.persistSelection({
            profileId: this.boundProfileId,
            sessionId: this.boundSessionId,
            selection,
        });
        await this.emitSessionBrowserEvent('selection_persisted');
    }

    private async captureSelectionCrop(
        bounds: DevBrowserSelectionPayload['bounds']
    ): Promise<EntityId<'att'> | undefined> {
        if (!this.boundProfileId || !this.boundSessionId || !this.view) {
            return undefined;
        }

        try {
            const image = await this.view.webContents.capturePage({
                x: Math.max(0, Math.round(bounds.x)),
                y: Math.max(0, Math.round(bounds.y)),
                width: Math.max(1, Math.round(bounds.width)),
                height: Math.max(1, Math.round(bounds.height)),
            });
            const pngBytes = image.toPNG();
            const sha256 = createHash('sha256').update(pngBytes).digest('hex');
            const size = image.getSize();
            const attachment = await conversationAttachmentStore.createSnapshot({
                profileId: this.boundProfileId,
                sessionId: this.boundSessionId,
                attachment: {
                    clientId: `browser-crop-${Date.now().toString(36)}`,
                    kind: 'image_attachment',
                    mimeType: 'image/png',
                    bytesBase64: Buffer.from(pngBytes).toString('base64'),
                    width: size.width,
                    height: size.height,
                    sha256,
                    byteSize: pngBytes.byteLength,
                    fileName: 'browser-selection.png',
                },
            });
            return attachment.id;
        } catch (error) {
            appLog.warn({
                tag: 'dev-browser',
                message: 'Failed to capture selection crop for dev browser snapshot.',
                windowId: this.window.id,
                sessionId: this.boundSessionId,
                error: error instanceof Error ? error.message : String(error),
            });
            return undefined;
        }
    }
}
