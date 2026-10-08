import { DatabaseSync, type StatementSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { importLegacyOrSeed, ensureCoreAccounts } from "./legacyImport";
import * as schema from "./schema";

// ─── Where the database lives ─────────────────────────────────────────────────
// The desktop app (electron/main.js) passes LAUNDRYPRO_DATA_DIR =
// %APPDATA%\LaundryPro — a fixed folder that does NOT depend on package.json's
// "name" (renaming the package used to silently switch to a new, empty data
// folder) and is never inside OneDrive (whose sync/restore used to roll the
// old JSON store back). Anything else (`npm run dev`, `npm start`) uses a
// separate dev database so testing can never touch real shop data.
function resolveDbFile(): string {
  if (process.env.LAUNDRYPRO_DB_FILE) return process.env.LAUNDRYPRO_DB_FILE;
  if (process.env.LAUNDRYPRO_DATA_DIR) return path.join(process.env.LAUNDRYPRO_DATA_DIR, "laundrypro.db");
  const base = process.env.APPDATA || path.join(os.homedir(), ".local", "share");
  return path.join(base, "LaundryPro-Dev", "laundrypro-dev.db");
}

// Old JSON store files to import from on first run. Electron passes the
// folders the desktop app used to write to; in dev it's the project folder.
function legacyCandidates(): string[] {
  if (process.env.LAUNDRYPRO_LEGACY_FILES) {
    try {
      return JSON.parse(process.env.LAUNDRYPRO_LEGACY_FILES) as string[];
    } catch {
      return [];
    }
  }
  return [path.join(process.cwd(), ".offline-data.json")];
}

// Next's standalone server.js chdirs into its own folder, and dev runs from the
// project root; drizzle/ (the SQL migrations) sits beside both.
function resolveMigrationsFolder(): string {
  const candidates = [process.env.LAUNDRYPRO_MIGRATIONS_DIR, path.join(process.cwd(), "drizzle")].filter(
    (dir): dir is string => !!dir
  );
  const found = candidates.find((dir) => fs.existsSync(path.join(dir, "meta", "_journal.json")));
  if (!found) throw new Error(`Database migrations folder not found (looked in ${candidates.join(", ")})`);
  return found;
}

function applyMigrations(sqlite: DatabaseSync) {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)`
  );
  const last = sqlite.prepare(`SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`).get() as
    | { created_at: number }
    | undefined;
  const pending = readMigrationFiles({ migrationsFolder: resolveMigrationsFolder() }).filter(
    (m) => !last || Number(last.created_at) < m.folderMillis
  );
  if (pending.length === 0) return;
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    for (const migration of pending) {
      for (const statement of migration.sql) {
        if (statement.trim()) sqlite.exec(statement);
      }
      sqlite
        .prepare(`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)`)
        .run(migration.hash, migration.folderMillis);
    }
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}

const BACKUPS_TO_KEEP = 30;

/** One consistent copy of the database per day, keeping the last 30 days. */
function dailyBackup(sqlite: DatabaseSync, dbFile: string) {
  try {
    const dir = path.join(path.dirname(dbFile), "backups");
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(dbFile, ".db");
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const target = path.join(dir, `${base}-${day}.db`);
    if (!fs.existsSync(target)) {
      sqlite.prepare("VACUUM INTO ?").run(target);
    }
    const old = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(`${base}-`) && f.endsWith(".db"))
      .sort()
      .slice(0, -BACKUPS_TO_KEEP);
    for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  } catch (err) {
    // A failed backup must never stop the shop from working.
    console.error("[db] daily backup failed:", err);
  }
}

function openDatabase() {
  const dbFile = resolveDbFile();
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const sqlite = new DatabaseSync(dbFile);
  // WAL + synchronous=FULL: a committed save survives an app kill or power
  // cut. busy_timeout covers a backup/antivirus briefly holding the file.
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA synchronous = FULL");
  sqlite.exec("PRAGMA busy_timeout = 5000");

  applyMigrations(sqlite);
  importLegacyOrSeed(sqlite, legacyCandidates(), path.dirname(dbFile));
  ensureCoreAccounts(sqlite);
  dailyBackup(sqlite, dbFile);
  console.log(`[db] using ${dbFile}`);
  return { sqlite, dbFile };
}

// Drizzle talks to node:sqlite (built into Node 22.13+/Electron) through its
// proxy driver, so there is no native module to compile or rebuild for Electron.
function createDrizzle(sqlite: DatabaseSync) {
  const cache = new Map<string, StatementSync>();
  const prepare = (query: string) => {
    let stmt = cache.get(query);
    if (!stmt) {
      stmt = sqlite.prepare(query);
      stmt.setReturnArrays(true);
      cache.set(query, stmt);
    }
    return stmt;
  };
  const toParam = (v: unknown) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
  return drizzle(
    async (query, params, method) => {
      const stmt = prepare(query);
      const args = params.map(toParam) as Parameters<StatementSync["run"]>;
      if (method === "run") {
        stmt.run(...args);
        return { rows: [] };
      }
      if (method === "get") {
        return { rows: stmt.get(...args) as unknown as unknown[] };
      }
      return { rows: stmt.all(...args) };
    },
    { schema }
  );
}

// Kept on globalThis: `next dev` bundles each route separately, and every
// route must share one connection (and one write queue, see transaction.ts).
interface DbState {
  sqlite: DatabaseSync;
  dbFile: string;
  db: SqliteRemoteDatabase<typeof schema>;
}
const dbGlobal = globalThis as unknown as { __laundryDb?: DbState };

function getState(): DbState {
  if (!dbGlobal.__laundryDb) {
    const { sqlite, dbFile } = openDatabase();
    dbGlobal.__laundryDb = { sqlite, dbFile, db: createDrizzle(sqlite) };
  }
  return dbGlobal.__laundryDb;
}

// Opened lazily on first use (not at import time) so `next build` can load
// route modules without creating a database.
export const db = new Proxy({} as SqliteRemoteDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getState().db as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

export function getSqlite(): DatabaseSync {
  return getState().sqlite;
}
