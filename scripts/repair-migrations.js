/**
 * Einmalige Reparatur der Migrations-Drift:
 * Eine frühere Session hat backup_agents-Spalten direkt in der SQLite-DB
 * angelegt, ohne sie zu migrieren. Dadurch scheitert die offizielle
 * Migration an "duplicate column name".
 *
 * Dieses Skript wendet die Migrations-Dateien einzeln an, überspringt
 * bereits vorhandene Spalten und trägt die Migrations danach korrekt
 * in __drizzle_migrations ein — danach läuft `npm start` normal.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';

const dbPath = process.argv[2] || './data/onebox.db';
const folder = path.resolve('server/db/migrations');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const journal = JSON.parse(fs.readFileSync(path.join(folder, 'meta', '_journal.json'), 'utf8'));

// Tabelle anlegen, falls sie fehlt (Spalten exakt wie drizzle-orm).
db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at numeric
)`);

const done = new Set(db.prepare('select hash from __drizzle_migrations').all().map((r) => r.hash));
let applied = 0;

for (const entry of journal.entries) {
  const file = path.join(folder, `${entry.tag}.sql`);
  if (!fs.existsSync(file)) continue;

  const sqlText = fs.readFileSync(file, 'utf8');
  const hash = crypto.createHash('sha256').update(sqlText).digest('hex');
  if (done.has(hash)) continue;
  const statements = sqlText
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  const skipped = [];
  for (const statement of statements) {
    try {
      db.exec(statement);
    } catch (error) {
      const msg = String(error.message || '');
      if (/duplicate column name/i.test(msg)) {
        skipped.push(msg);
        continue;
      }
      if (/already exists/i.test(msg)) {
        skipped.push(msg);
        continue;
      }
      console.error(`[repair] statement failed in ${entry.tag}:`, msg);
      console.error(statement.slice(0, 200));
      process.exit(1);
    }
  }

  // created_at muss `folderMillis` (journal.when) sein — drizzle vergleicht
  // die letzte Zeile mit `last[2] < migration.folderMillis`.
  db.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)')
    .run(hash, entry.when);

  applied += 1;
  console.log(`[repair] applied ${entry.tag}${skipped.length ? ` (skipped ${skipped.length} existing column(s))` : ''}`);
}

const tables = db.prepare("select name from sqlite_master where type='table' and (name like 'document%' or name = 'notifications')").all();
console.log('[repair] document tables:', tables.map((t) => t.name).join(', ') || '(none)');
console.log('[repair] total migrations recorded:', db.prepare('select count(*) c from __drizzle_migrations').get().c);
console.log(applied ? '[repair] done.' : '[repair] nothing to do.');
db.close();
