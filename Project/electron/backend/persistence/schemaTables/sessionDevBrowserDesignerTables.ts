export interface SessionDevBrowserDesignerSessionsTable {
    id: string;
    profile_id: string;
    session_id: string;
    selection_id: string;
    page_identity: string;
    action_chip: string | null;
    intent_text: string;
    requested_variant_count: number;
    generation_status: string;
    active_variant_id: string | null;
    accepted_variant_id: string | null;
    generation_run_id: string | null;
    error_message: string | null;
    stale: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface SessionDevBrowserDesignerAnnotationsTable {
    id: string;
    profile_id: string;
    session_id: string;
    designer_session_id: string;
    selection_id: string;
    page_identity: string;
    kind: string;
    text: string | null;
    geometry_json: string;
    crop_attachment_id: string | null;
    sequence: number;
    stale: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface SessionDevBrowserDesignerVariantsTable {
    id: string;
    profile_id: string;
    session_id: string;
    designer_session_id: string;
    selection_id: string;
    page_identity: string;
    name: string;
    summary_markdown: string;
    rationale_markdown: string;
    style_patches_json: string;
    text_content_override: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}
