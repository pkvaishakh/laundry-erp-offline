# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LaundryPro — a single-shop laundry billing and accounting app. Order intake, delivery
tracking, customer dues, a per-item/per-service pricing catalog, and a full
double-entry expense/accounting module. See [README.md](README.md) for the full
feature list; this file covers what the README doesn't.

## Commands

```bash
npm install
npm run dev         # http://localhost:3000
npm run build
npm run start
npm run lint
npm run typecheck    # tsc --noEmit
```

No test suite exists in this repo. No `.env`/DB setup is required to run locally —
see "Database" below. Requires **Node 24** (built-in `node:sqlite`; 22.13+ minimum).

## Architecture

- **No `models/`/`controllers/` split.** `src/db/schema.ts` (single file) is the
  model layer; `route.ts` handlers under `src/app/api/**` are the controllers, using
  Next.js App Router conventions directly (`export async function GET/POST/PUT/DELETE`,
  dynamic segments as `{ params }: { params: Promise<{ id: string }> }` — must be
  awaited, per Next 15+/16 route handler signature).
- **No auth/session system.** Single-user local app.
- Client pages under `src/app/**/page.tsx` call the API routes directly (fetch), no
  server actions/RSC data layer in the mutation path.

### Database (SQLite, built-in)

`src/db/index.ts` opens a SQLite file with Node's built-in `node:sqlite` and wraps it
with Drizzle's `sqlite-proxy` driver — no native module, nothing to rebuild for
Electron. `src/db/schema.ts` uses `drizzle-orm/sqlite-core`.

- **Location:** desktop app → `%APPDATA%\LaundryPro\laundrypro.db` (fixed; passed by
  `electron/main.js` as `LAUNDRYPRO_DATA_DIR`). Never derive it from package.json
  `name` / `app.getPath("userData")` — renaming the package used to silently switch
  the app to an empty data folder. `npm run dev`/`npm start` use a separate
  `%APPDATA%\LaundryPro-Dev\laundrypro-dev.db`. Never put the database in the project
  folder (it is inside OneDrive).
- **Startup** (synchronous, on first query): apply `drizzle/` migrations → one-time
  import of the old `.offline-data.json` store (`src/db/legacyImport.ts`: verifies row
  counts, writes `import-report.txt`, never modifies the old file; re-checks on each
  start while the database has no business data) → ensure core accounts → daily
  backup into `backups/` (last 30 kept).
- **Schema changes:** edit `schema.ts`, run `npx drizzle-kit generate --name <what>`,
  keep the new `drizzle/` files. They ship in the standalone bundle and apply
  automatically on the client's next launch. Never edit an already-shipped migration.
- **Transactions:** every POST/PUT/PATCH/DELETE route is exported as
  `export const POST = withWriteTransaction(handlePOST)` (`src/db/transaction.ts`):
  the whole request is one transaction, write requests run one at a time, and a
  thrown error or a 4xx/5xx response rolls back all of its writes. New write routes
  must use this wrapper. Older "compensating delete" code in some routes is now
  redundant but harmless.
- Use `like` (case-insensitive for ASCII in SQLite), not `ilike`. Raw aggregate SQL
  goes through `getSqlite().prepare(...)` (returns plain objects), as in the reports
  "sales" query.
- Money columns are a custom type: stored numeric (so `> 0` and ORDER BY compare
  numerically), read back as strings. Timestamps are stored as ISO-8601 UTC text and
  read back as strings.

### Money and derived values

- Money columns are passed through the app as strings; parse with
  `parseFloat`, format with `formatCurrency()` (`src/lib/utils.ts`).
- `orders.totalAmount/paidAmount/dueAmount` and `customers.totalDue` are
  **denormalized and updated manually** by each route that touches orders/payments
  (not triggers/computed columns) — when adding a new mutation path that changes
  order totals or payments, you must update these fields yourself in the same
  route, matching the pattern in `src/app/api/orders/route.ts` and
  `src/app/api/orders/[id]/route.ts`.
- Ledger account balances (`src/lib/ledger.ts` `computeBalance`) are **always
  computed on the fly** from `journal_entry_lines`, never stored — so reports stay
  consistent with the ledger by construction. Don't add a cached/stored balance
  field.
- Expense `overdue` status is derived at read-time (`deriveExpenseStatus`) from
  `status === "pending" && dueDate < today`, never persisted as a transition.

### Double-entry ledger invariant

Every write to `journal_entries`/`journal_entry_lines` must go through
`postJournalEntry()` in `src/lib/ledger.ts`, which enforces (throwing `LedgerError`
before any write) that there are ≥2 lines, each line is debit-only or credit-only,
amounts are non-negative, and total debits equal total credits (compared in cents
to avoid float drift). Routes catch `LedgerError` and return it as a 400 — don't
let it propagate as a 500.

### Order line item pricing

`resolvePrice()` in `src/app/orders/new/page.tsx` is the single place that resolves
a line item's price: it looks up `service_item_prices` for a
`(serviceId, itemId)` override and falls back to the service's base `price` if none
exists. Any new UI that creates order line items should reuse this resolution
logic rather than reading `services.price` directly, or item-level overrides will
silently be ignored.

### Soft delete

"Delete" on catalog data (items, services, vendors, expense categories) sets
`active: false`; it never removes the row. Queries over these tables that should
exclude removed entries must filter `active` explicitly — it's not automatic.
