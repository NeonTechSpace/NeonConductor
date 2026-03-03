import BetterSqlite3 from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runtimeSqlMigrations } from '@/app/backend/persistence/generatedMigrations';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';

export interface PersistenceContext {
    sqlite: BetterSqliteDatabase;
    db: Kysely<DatabaseSchema>;
    dbPath: string;
}

export interface InitializePersistenceOptions {
    dataDir?: string;
    dbPath?: string;
    resetDb?: boolean;
    forceReinitialize?: boolean;
}

const DEFAULT_DB_FILENAME = 'neonconductor.db';
const TEST_MEMORY_PATH = ':memory:';
const DEFAULT_PROFILE_ID = 'profile_local_default';
const DB_FILE_EXTENSIONS = new Set(['.db', '.sqlite']);

const PROVIDER_SEED = [
    { id: 'kilo', label: 'Kilo', supportsByok: 0 },
    { id: 'openai', label: 'OpenAI', supportsByok: 1 },
] as const;

const MODEL_SEED = [
    { id: 'kilo/auto', providerId: 'kilo', label: 'Kilo Auto' },
    { id: 'kilo/code', providerId: 'kilo', label: 'Kilo Code' },
    { id: 'openai/gpt-5', providerId: 'openai', label: 'GPT-5' },
    { id: 'openai/gpt-5-mini', providerId: 'openai', label: 'GPT-5 Mini' },
] as const;

const TOOL_SEED = [
    {
        id: 'read_file',
        label: 'Read File',
        description: 'Read file contents from the active workspace.',
        permissionPolicy: 'ask',
    },
    {
        id: 'list_files',
        label: 'List Files',
        description: 'List files and folders in the active workspace.',
        permissionPolicy: 'ask',
    },
    {
        id: 'run_command',
        label: 'Run Command',
        description: 'Run a command in a sandboxed shell.',
        permissionPolicy: 'deny',
    },
] as const;

const MCP_SERVER_SEED = [
    {
        id: 'filesystem',
        label: 'Filesystem MCP',
        authMode: 'none',
        connectionState: 'disconnected',
        authState: 'authenticated',
    },
    {
        id: 'github',
        label: 'GitHub MCP',
        authMode: 'token',
        connectionState: 'disconnected',
        authState: 'unauthenticated',
    },
] as const;

const DEFAULT_PROVIDER_ID = 'kilo';
const DEFAULT_MODEL_ID = 'kilo/auto';

let persistenceContext: PersistenceContext | null = null;

function isMemoryDbPath(dbPath: string): boolean {
    return dbPath === TEST_MEMORY_PATH;
}

function resolveDefaultDbPath(): string {
    const envDbPath = process.env['NEONCONDUCTOR_DB_PATH'];
    if (typeof envDbPath === 'string' && envDbPath.trim().length > 0) {
        return envDbPath.trim();
    }

    const fallbackDir = path.join(os.tmpdir(), 'neonconductor');
    return path.join(fallbackDir, DEFAULT_DB_FILENAME);
}

function resolveSafeFileDbPath(dbPath: string): string {
    const trimmed = dbPath.trim();
    if (trimmed.length === 0) {
        throw new Error('Persistence DB path must be a non-empty string.');
    }

    if (!path.isAbsolute(trimmed)) {
        throw new Error(`Persistence DB path must be absolute. Received: "${trimmed}"`);
    }

    const normalized = path.resolve(trimmed);
    const extension = path.extname(normalized).toLowerCase();

    if (!DB_FILE_EXTENSIONS.has(extension)) {
        throw new Error(
            `Persistence DB path must use one of: ${Array.from(DB_FILE_EXTENSIONS).join(', ')}. Received: "${normalized}"`
        );
    }

    const directory = path.dirname(normalized);
    const parsedDirectory = path.parse(directory);
    if (directory === parsedDirectory.root) {
        throw new Error(`Persistence DB path directory cannot be filesystem root: "${normalized}"`);
    }

    return normalized;
}

function resolveDbPath(options: InitializePersistenceOptions): string {
    const explicitDbPath = options.dbPath?.trim();
    if (explicitDbPath) {
        return isMemoryDbPath(explicitDbPath) ? TEST_MEMORY_PATH : resolveSafeFileDbPath(explicitDbPath);
    }

    if (options.dataDir?.trim()) {
        if (!path.isAbsolute(options.dataDir)) {
            throw new Error(`Persistence dataDir must be absolute. Received: "${options.dataDir}"`);
        }

        return resolveSafeFileDbPath(path.join(path.resolve(options.dataDir), DEFAULT_DB_FILENAME));
    }

    return resolveSafeFileDbPath(resolveDefaultDbPath());
}

function ensureParentDirectory(dbPath: string): void {
    if (isMemoryDbPath(dbPath)) {
        return;
    }

    const directory = path.dirname(dbPath);
    mkdirSync(directory, { recursive: true });
}

function applySqlMigrations(sqlite: BetterSqliteDatabase): void {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );
    `);

    const isAppliedStatement = sqlite.prepare('SELECT 1 FROM schema_migrations WHERE name = ? LIMIT 1');
    const recordAppliedStatement = sqlite.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');

    for (const migration of runtimeSqlMigrations) {
        const wasApplied = isAppliedStatement.get(migration.name);
        if (wasApplied) {
            continue;
        }

        const appliedAt = new Date().toISOString();

        const runMigration = sqlite.transaction(() => {
            sqlite.exec(migration.sql);
            recordAppliedStatement.run(migration.name, appliedAt);
        });

        runMigration();
    }
}

function seedRuntimeData(sqlite: BetterSqliteDatabase): void {
    const now = new Date().toISOString();

    const insertProfile = sqlite.prepare(
        `
            INSERT OR IGNORE INTO profiles (id, name, created_at, updated_at)
            VALUES (?, ?, ?, ?)
        `
    );
    const insertProvider = sqlite.prepare(
        `
            INSERT OR IGNORE INTO providers (id, label, supports_byok, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `
    );
    const insertModel = sqlite.prepare(
        `
            INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `
    );
    const insertTool = sqlite.prepare(
        `
            INSERT OR IGNORE INTO tools_catalog (id, label, description, permission_policy, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `
    );
    const insertMcpServer = sqlite.prepare(
        `
            INSERT OR IGNORE INTO mcp_servers
                (id, label, auth_mode, connection_state, auth_state, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
    );
    const insertSettingIfMissing = sqlite.prepare(
        `
            INSERT OR IGNORE INTO settings (id, profile_id, key, value_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `
    );

    insertProfile.run(DEFAULT_PROFILE_ID, 'Local Default', now, now);

    for (const provider of PROVIDER_SEED) {
        insertProvider.run(provider.id, provider.label, provider.supportsByok, now, now);
    }

    for (const model of MODEL_SEED) {
        insertModel.run(model.id, model.providerId, model.label, now, now);
    }

    for (const tool of TOOL_SEED) {
        insertTool.run(tool.id, tool.label, tool.description, tool.permissionPolicy, now, now);
    }

    for (const server of MCP_SERVER_SEED) {
        insertMcpServer.run(
            server.id,
            server.label,
            server.authMode,
            server.connectionState,
            server.authState,
            now,
            now
        );
    }

    insertSettingIfMissing.run(
        'setting_default_provider',
        DEFAULT_PROFILE_ID,
        'default_provider_id',
        JSON.stringify(DEFAULT_PROVIDER_ID),
        now
    );
    insertSettingIfMissing.run(
        'setting_default_model',
        DEFAULT_PROFILE_ID,
        'default_model_id',
        JSON.stringify(DEFAULT_MODEL_ID),
        now
    );
}

export function reseedRuntimeData(): void {
    const context = getPersistence();
    seedRuntimeData(context.sqlite);
}

function createPersistenceContext(dbPath: string): PersistenceContext {
    ensureParentDirectory(dbPath);

    const sqlite = new BetterSqlite3(dbPath);
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('busy_timeout = 5000');

    applySqlMigrations(sqlite);
    seedRuntimeData(sqlite);

    const db = new Kysely<DatabaseSchema>({
        dialect: new SqliteDialect({
            database: sqlite,
        }),
    });

    return {
        sqlite,
        db,
        dbPath,
    };
}

export function closePersistence(): void {
    if (!persistenceContext) {
        return;
    }

    void persistenceContext.db.destroy();
    persistenceContext.sqlite.close();
    persistenceContext = null;
}

export function initializePersistence(options: InitializePersistenceOptions = {}): PersistenceContext {
    const dbPath = resolveDbPath(options);

    if (options.resetDb && !isMemoryDbPath(dbPath)) {
        rmSync(dbPath, { force: true });
    }

    if (persistenceContext && !options.forceReinitialize && persistenceContext.dbPath === dbPath) {
        return persistenceContext;
    }

    if (persistenceContext) {
        closePersistence();
    }

    persistenceContext = createPersistenceContext(dbPath);
    return persistenceContext;
}

export function getPersistence(): PersistenceContext {
    if (persistenceContext) {
        return persistenceContext;
    }

    return initializePersistence();
}

export function resetPersistenceForTests(dbPath = TEST_MEMORY_PATH): PersistenceContext {
    closePersistence();
    return initializePersistence({
        dbPath,
        resetDb: !isMemoryDbPath(dbPath),
        forceReinitialize: true,
    });
}

export function getDefaultProfileId(): string {
    return DEFAULT_PROFILE_ID;
}
