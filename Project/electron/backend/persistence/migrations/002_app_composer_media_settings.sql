CREATE TABLE app_composer_media_settings (
    id TEXT PRIMARY KEY,
    max_image_attachments_per_message INTEGER NOT NULL,
    image_compression_concurrency INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO app_composer_media_settings (id, max_image_attachments_per_message, image_compression_concurrency, updated_at)
VALUES ('global', 10, 2, '2026-03-12T00:00:00.000Z');
