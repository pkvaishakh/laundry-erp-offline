# LaundryPro — Laundry Billing & Accounting Management System

A single-shop laundry management app: order intake, delivery tracking, customer dues,
a per-item/per-service pricing catalog, and a full double-entry expense/accounting
module (chart of accounts, general ledger, accounts payable, trial balance, balance
sheet).

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4, hand-rolled components (no UI kit) |
| Charts | Recharts |
| ORM | Drizzle ORM (`src/db/schema.ts`), SQLite dialect |
| Database | SQLite (built into Node/Electron, no install). See [Database](#database) below. |

## Getting Started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint
```

No `.env`/DB setup is required: the SQLite database is created automatically on
first run. Requires Node 24 (Node 22.13+ minimum).

## Features

### Orders & Billing
- Create orders against a customer (auto-created on first order by phone number),
  with multiple line items (item × service × quantity).
- Order statuses: `pending → processing → ready → delivered` (+ `cancelled`).
- Barcode printing per order item, delivery tracking, shelf number.
- Payments recorded against orders/customers (cash/card/upi/other), auto-updates
  `orders.paidAmount/dueAmount` and `customers.totalDue`.

### Catalog (Services, Items, Pricing)
- **Services**: billed per `item`, `kg`, or `sqft`, each with a base price.
- **Items**: the physical things being laundered (Shirt, Suit, Bedsheet, ...).
- **Per-item pricing overrides** (`service_item_prices` table): for `item`/`sqft`
  services only (kg-billed services always charge one flat rate). Editable from
  either direction in `/catalog`:
  - Services tab → ₹ icon on a service → set that service's price per item.
  - Items tab → ₹ icon on an item → set that item's price per service.
  - Blank = falls back to the service's base price. The New Order page
    (`resolvePrice()` in `src/app/orders/new/page.tsx`) looks up the override
    automatically once both a service and item are picked.
- **Expense categories** and **vendors** are also managed here.

### Expense Module (double-entry accounting)
- Record expenses with date, amount, description, category, and vendor.
- Payment method per expense: `cash`, `bank`, or `credit` (payable — due on a
  future date, capped at 90 days out).
- Status: `pending` / `paid` / `overdue` (overdue is derived at read-time from
  `dueDate`, not a stored transition).
- Every expense **atomically** creates a balanced journal entry:
  - Debit the expense's category account.
  - Credit Cash / Bank / Accounts Payable depending on payment method.
- Paying off a previously-due (credit) expense creates a second journal entry:
  Debit Accounts Payable, Credit Cash/Bank.
- A "close period" action rolls accumulated expense-account balances into the
  Capital account via a closing journal entry (Debit Capital, Credit each expense
  account) — this is how Capital reflects business expenses, rather than expenses
  hitting Capital directly per-transaction.
- All account balances are computed on the fly from `journal_entry_lines`
  (no stored running balance), so reports are always consistent with the ledger.

### Reports (`/reports`, `src/app/api/reports/route.ts`)
`orders`, `payments`, `dues`, `sales`, `expenses`, `trial-balance`, `balance-sheet`,
`general-ledger`, `ap-aging`.

### Dashboard (`/`)
Today's orders/collection, outstanding dues, revenue, weekly/monthly charts,
payment method breakdown, recent orders, customers with dues, and expense stats
(pending/overdue counts, recent expenses, cash/bank balances).

## Project Structure

```
src/
  app/
    api/            Route handlers (Next.js App Router "controllers")
      orders/ customers/ items/ services/ payments/
      vendors/ expense-categories/ expenses/ accounts/
      service-item-prices/  services/[id]/item-prices/  items/[id]/prices/
      reports/ dashboard/ settings/
    page.tsx         Dashboard
    orders/ customers/ payments/ catalog/ expenses/ reports/ barcodes/ settings/
  components/        Sidebar, Modal, StatusBadge (shared UI)
  db/
    schema.ts        All Drizzle table definitions (single file, source of truth)
    index.ts         Opens the SQLite database, exports `db`
    legacyImport.ts  One-time import of the old JSON store
    transaction.ts   withWriteTransaction() for write routes
  lib/
    utils.ts         Formatters (currency/date), constants, code generators
```

There are no `models/`/`controllers/` folders by design — Drizzle table objects in
`schema.ts` are the models, and `route.ts` handlers under `src/app/api/**` are the
controllers. No auth/session system exists; this is a single-user local app.

## Database

SQLite, using Node's built-in `node:sqlite` (Node 22.13+, bundled with Electron) through
Drizzle's `sqlite-proxy` driver. There is nothing to install on client PCs.

- **Desktop app data:** `%APPDATA%\LaundryPro\laundrypro.db`, with daily copies in
  `%APPDATA%\LaundryPro\backups\` (last 30 days). To back up or move to a new PC, copy
  `laundrypro.db` (with the app closed) into the same folder on the other machine.
- **Dev (`npm run dev`):** a separate `%APPDATA%\LaundryPro-Dev\laundrypro-dev.db`, so
  testing never touches shop data.
- **Upgrading from the old JSON store:** on first launch, the old `.offline-data.json`
  is imported automatically (counts verified, see `import-report.txt` in the data
  folder). The old file is never modified or deleted.
- **Schema changes:** edit `src/db/schema.ts`, run `npx drizzle-kit generate --name <change>`;
  migrations in `drizzle/` apply automatically on the next launch.
- Every write request runs in a single transaction: it saves completely or not at all.

## Conventions

- Money: numeric columns, passed around the app as strings, parsed with
  `parseFloat`/formatted with `formatCurrency()`.
- IDs: auto-increment integers (never reused), no UUIDs.
- "Delete" on catalog data (items/services/vendors/categories) is a soft
  `active: false` update, not a real row delete.
- DB columns are `snake_case`, TS fields are `camelCase` (Drizzle maps between them).
