import { initializePersistence } from '@/app/backend/persistence/db';

const dbPath = process.env['NEONCONDUCTOR_DB_PATH'];

initializePersistence({
    ...(dbPath ? { dbPath } : {}),
    forceReinitialize: true,
});

console.log('[runtime-migrate] migrations applied successfully');
