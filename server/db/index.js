import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { config, paths } from '../config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(paths.uploads, { recursive: true });
fs.mkdirSync(paths.thumbs, { recursive: true });
fs.mkdirSync(paths.backupSnapshots, { recursive: true });
fs.mkdirSync(paths.runtime, { recursive: true });
fs.mkdirSync(config.filesDir, { recursive: true });

const sqlite = new Database(paths.db);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('temp_store = MEMORY');

export const db = drizzle(sqlite, { schema });

function migrationCount() {
  try {
    const row = sqlite.prepare('select count(*) as count from __drizzle_migrations').get();
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

function journalCount(folder) {
  const file = path.join(folder, 'meta', '_journal.json');
  if (!fs.existsSync(file)) return 0;
  return JSON.parse(fs.readFileSync(file, 'utf8')).entries?.length ?? 0;
}

export async function runMigrations() {
  const folder = path.join(process.cwd(), 'server', 'db', 'migrations');
  const pending = journalCount(folder) - migrationCount();
  const hasTables = sqlite.prepare("select count(*) as count from sqlite_master where type = 'table' and name not like 'sqlite_%'").get().count > 0;
  if (pending > 0 && hasTables) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(paths.backupSnapshots, `pre-migration-${stamp}.db`);
    await sqlite.backup(target);
    console.log(`[db] ${pending} pending migration(s). Snapshot written to ${target}`);
  }
  if (pending > 0) {
    try {
      migrate(db, { migrationsFolder: folder });
      console.log(`[db] applied ${pending} migration(s)`);
    } catch (error) {
      console.error('[db] Migration failed. Onebox will not start.');
      console.error(error);
      throw error;
    }
  }
}

export function closeDb() {
  sqlite.pragma('wal_checkpoint(TRUNCATE)');
  sqlite.close();
}

export { sqlite, schema };
