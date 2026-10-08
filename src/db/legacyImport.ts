import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, type SQLiteColumn, type SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";
import { DEFAULT_DATA } from "./seed";

// The old JSON store's top-level keys are the SQL table names.
const TABLES: SQLiteTable[] = [
  schema.services,
  schema.items,
  schema.serviceItemPrices,
  schema.customers,
  schema.orders,
  schema.orderItems,
  schema.payments,
  schema.settings,
  schema.accounts,
  schema.vendors,
  schema.journalEntries,
  schema.journalEntryLines,
  schema.expenses,
];

// PRAGMA user_version: 0 = fresh file, nothing imported/seeded yet.
const INITIALIZED_VERSION = 1;

type LegacyStore = Record<string, Array<Record<string, unknown>>>;

function fallbackFor(column: SQLiteColumn): unknown {
  return column.getSQLType() === "text" ? "" : 0;
}

/** Converts one legacy JSON row into driver values for every schema column. */
function toDriverRow(table: SQLiteTable, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(getTableColumns(table)) as Array<[string, SQLiteColumn]>) {
    // The old store wrote camelCase keys, but older rows may use the SQL name.
    let value = row[column.name] ?? row[key];
    if (value === undefined || value === null) {
      if (column.primary) continue; // let SQLite assign one
      if (!column.notNull) {
        out[column.name] = null;
        continue;
      }
      value = column.default !== undefined ? column.default : column.defaultFn ? column.defaultFn() : fallbackFor(column);
    }
    let driverValue = column.mapToDriverValue(value);
    if (typeof driverValue === "boolean") driverValue = driverValue ? 1 : 0;
    else if (driverValue !== null && typeof driverValue === "object") driverValue = JSON.stringify(driverValue);
    out[column.name] = driverValue;
  }
  return out;
}

/**
 * Inserts one row. The old store never enforced uniqueness, so a duplicate
 * order code / phone / id is kept (never dropped) — a duplicate id gets a new
 * id, a duplicate unique value gets a "-dupN" suffix — and reported.
 */
function insertRow(sqlite: DatabaseSync, tableName: string, values: Record<string, unknown>, warnings: string[]) {
  const row = { ...values };
  for (let attempt = 1; ; attempt++) {
    const cols = Object.keys(row);
    const sql = `INSERT INTO "${tableName}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
    try {
      sqlite.prepare(sql).run(...(Object.values(row) as never[]));
      return;
    } catch (err) {
      const match = /UNIQUE constraint failed: \w+\.(\w+)/.exec(String((err as Error).message));
      if (!match || attempt > 20) throw err;
      const column = match[1];
      if (column === "id") {
        warnings.push(`${tableName}: duplicate id ${row.id} — imported with a new id`);
        delete row.id;
      } else {
        const original = values[column];
        row[column] = `${original}-dup${attempt}`;
        warnings.push(`${tableName}: duplicate ${column} "${original}" — imported as "${row[column]}"`);
      }
    }
  }
}

function count(sqlite: DatabaseSync, tableName: string): number {
  return (sqlite.prepare(`SELECT count(*) AS n FROM "${tableName}"`).get() as { n: number }).n;
}

function readLegacyFile(file: string): LegacyStore | null {
  if (!fs.existsSync(file)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as LegacyStore;
  } catch (err) {
    // Never start with an empty database when old data exists but can't be
    // read — that would look exactly like "all my orders disappeared".
    throw new Error(
      `Old data file ${file} exists but could not be read, so it was not imported. Nothing was changed. Fix or move that file, then restart. (${String(err)})`
    );
  }
}

const BUSINESS_TABLES = ["customers", "orders", "payments", "expenses", "journal_entries"];

function businessRowCount(store: LegacyStore): number {
  return BUSINESS_TABLES.reduce((n, t) => n + (Array.isArray(store[t]) ? store[t].length : 0), 0);
}

function orderCount(store: LegacyStore): number {
  return Array.isArray(store.orders) ? store.orders.length : 0;
}

/**
 * Runs once per database file. If an old `.offline-data.json` store exists,
 * every row of it is copied in (ids preserved) and the row counts verified;
 * otherwise the default catalog/accounts are seeded. The old file is only
 * read, never modified or deleted, so it stays as a permanent backup.
 */
export function importLegacyOrSeed(sqlite: DatabaseSync, candidates: string[], reportDir: string) {
  const version = (sqlite.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  // Safety net: a database that was started fresh (no old data found at the
  // time) but has never been used for business — no customers, orders,
  // payments, expenses or ledger entries — still picks up old data that
  // shows up later, instead of hiding it forever behind an empty database.
  const untouched =
    version < INITIALIZED_VERSION ||
    BUSINESS_TABLES.every((t) => count(sqlite, t) === 0);
  if (!untouched) return;

  // If several old data folders exist, use the one with the most orders
  // (most recently written breaks ties); the others are left untouched.
  const found = candidates
    .map((file) => ({ file, store: readLegacyFile(file) }))
    .filter((c): c is { file: string; store: LegacyStore } => c.store !== null)
    .map((c) => ({ ...c, mtime: fs.statSync(c.file).mtimeMs }))
    .sort((a, b) => orderCount(b.store) - orderCount(a.store) || b.mtime - a.mtime);
  const source = found[0];
  if (version >= INITIALIZED_VERSION && (!source || businessRowCount(source.store) === 0)) return;

  const warnings: string[] = [];
  const counts: string[] = [];
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    // Only reached for a fresh or never-used database: clear the default
    // catalog seeded earlier so the old data's ids are kept exactly.
    for (const table of TABLES) sqlite.exec(`DELETE FROM "${getTableConfig(table).name}"`);
    for (const table of TABLES) {
      const tableName = getTableConfig(table).name;
      const legacyRows = source && Array.isArray(source.store[tableName]) ? source.store[tableName] : [];
      // Same rule as the old store: an empty catalog/chart of accounts gets the defaults.
      const rows = legacyRows.length > 0 ? legacyRows : DEFAULT_DATA[tableName] ?? [];
      for (const row of rows) insertRow(sqlite, tableName, toDriverRow(table, row), warnings);

      const inDb = count(sqlite, tableName);
      if (inDb !== rows.length) {
        throw new Error(`Import check failed for ${tableName}: ${rows.length} rows in old data, ${inDb} in database`);
      }
      if (legacyRows.length > 0) counts.push(`${tableName}: ${inDb}`);
    }
    sqlite.exec(`PRAGMA user_version = ${INITIALIZED_VERSION}`);
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }

  const report = [
    `LaundryPro data import — ${new Date().toISOString()}`,
    source ? `Imported from: ${source.file}` : "No old data file found — started with default catalog.",
    ...found.slice(1).map((c) => `Also found (not imported, left untouched): ${c.file} (${orderCount(c.store)} orders)`),
    "",
    ...counts,
    ...(warnings.length ? ["", "Warnings:", ...warnings] : []),
  ].join("\n");
  try {
    fs.writeFileSync(path.join(reportDir, "import-report.txt"), report + "\n", "utf8");
  } catch {
    // report is informational only
  }
  console.log(`[db] ${report.replace(/\n/g, "\n[db] ")}`);
}

/** The core accounts are looked up by code everywhere; make sure they exist. */
export function ensureCoreAccounts(sqlite: DatabaseSync) {
  const existing = new Set(
    (sqlite.prepare(`SELECT code FROM "accounts"`).all() as Array<{ code: string }>).map((a) => a.code)
  );
  const missing = DEFAULT_DATA.accounts.filter((a) => !existing.has(String(a.code)));
  if (missing.length === 0) return;
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    for (const account of missing) {
      const { id: _id, ...withoutId } = account;
      insertRow(sqlite, "accounts", toDriverRow(schema.accounts, withoutId), []);
    }
    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }
}
