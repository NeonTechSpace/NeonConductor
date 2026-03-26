import { McpServerEditorSection } from '@/web/components/settings/appSettings/mcpServerEditorSection';
import { McpServerListSection } from '@/web/components/settings/appSettings/mcpServerListSection';
import { useMcpSettingsController } from '@/web/components/settings/appSettings/useMcpSettingsController';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';

export function McpSettingsSection(props: { profileId: string; currentWorkspaceFingerprint?: string }) {
    const controller = useMcpSettingsController(props);

    return (
        <section className='space-y-5'>
            <div className='grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]'>
                <McpServerListSection
                    servers={controller.servers}
                    {...(controller.currentWorkspaceFingerprint
                        ? { currentWorkspaceFingerprint: controller.currentWorkspaceFingerprint }
                        : {})}
                    isBusy={controller.isBusy}
                    onEditServer={controller.startEditServerDraft}
                    onConnectServer={(server) => controller.connectServer(server)}
                    onDisconnectServer={(server) => controller.disconnectServer(server)}
                    onRequestDelete={(server) => {
                        controller.setDeleteTarget({ id: server.id, label: server.label });
                    }}
                />

                <McpServerEditorSection
                    editorMode={controller.editorMode}
                    draft={controller.draft}
                    {...(controller.statusMessage ? { statusMessage: controller.statusMessage } : {})}
                    isBusy={controller.isBusy}
                    onStartCreate={() => {
                        controller.startCreateServerDraft();
                    }}
                    onDraftChange={(updater) => {
                        controller.setDraft((current) => updater(current));
                    }}
                    onSubmit={() => controller.submitDraft()}
                />
            </div>

            <ConfirmDialog
                open={!!controller.deleteTarget}
                title='Delete MCP Server'
                message={
                    controller.deleteTarget
                        ? `Delete "${controller.deleteTarget.label}"? This removes its config, discovered tools, and env secrets.`
                        : ''
                }
                confirmLabel='Delete server'
                destructive
                busy={controller.deletePending}
                onCancel={() => {
                    controller.setDeleteTarget(undefined);
                }}
                onConfirm={() => {
                    void controller.confirmDeleteServer();
                }}
            />
        </section>
    );
}
