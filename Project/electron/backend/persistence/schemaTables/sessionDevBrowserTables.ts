export interface SessionDevBrowserStateTable {
    session_id: string;
    profile_id: string;
    scheme: string | null;
    host: string | null;
    port: number | null;
    path: string | null;
    source_kind: string | null;
    browser_availability: string;
    validation_json: string | null;
    current_page_json: string | null;
    picker_active: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface SessionDevBrowserSelectionsTable {
    id: string;
    profile_id: string;
    session_id: string;
    page_identity: string;
    page_url: string;
    page_title: string | null;
    selector_json: string;
    ancestry_trail_json: string;
    accessible_label: string | null;
    accessible_role: string | null;
    text_excerpt: string | null;
    bounds_json: string;
    crop_attachment_id: string | null;
    enrichment_mode: string;
    react_enrichment_json: string | null;
    stale: 0 | 1;
    created_at: string;
}

export interface SessionDevBrowserCommentDraftsTable {
    id: string;
    profile_id: string;
    session_id: string;
    selection_id: string;
    page_identity: string;
    comment_text: string;
    inclusion_state: string;
    sequence: number;
    stale: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface SessionDevBrowserDesignerDraftsTable {
    id: string;
    profile_id: string;
    session_id: string;
    selection_id: string;
    source_variant_id: string | null;
    page_identity: string;
    inclusion_state: string;
    apply_mode: string;
    apply_status: string;
    blocked_reason_message: string | null;
    style_patches_json: string;
    text_content_override: string | null;
    stale: 0 | 1;
    created_at: string;
    updated_at: string;
}
