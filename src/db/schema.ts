import { sqliteTable, text, integer, customType } from "drizzle-orm/sqlite-core";

// ─── Column types ──────────────────────────────────────────────────────────────
// Money/quantity: passed through the app as strings (as with Postgres
// numeric), but stored with NUMERIC affinity so SQL comparisons and sorting
// (`dueAmount > 0`, `ORDER BY total_due`) are numeric, not text, comparisons.
// Rounded to 2 decimals on write, matching the old numeric(10,2) columns.
const money = customType<{ data: string; driverData: number | string }>({
  dataType() {
    return "numeric";
  },
  toDriver(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : String(value);
  },
  fromDriver(value) {
    return String(value);
  },
});

// Timestamps: stored as ISO-8601 UTC text (sorts and compares correctly as
// text). Accepts a Date or a date string on write; read back as the ISO string.
const timestamp = customType<{ data: Date | string; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value) {
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toISOString();
  },
  fromDriver(value) {
    return value;
  },
});

// Calendar dates (no time), e.g. "2026-10-02".
const date = (name: string) => text(name);
const boolean = (name: string) => integer(name, { mode: "boolean" });
const id = () => integer("id").primaryKey({ autoIncrement: true });
const createdAt = () => timestamp("created_at").notNull().$defaultFn(() => new Date());

// ─── Services ────────────────────────────────────────────────────────────────
export const services = sqliteTable("services", {
  id: id(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("item"), // 'item' | 'kg' | 'sqft'
  price: money("price").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ─── Items ────────────────────────────────────────────────────────────────────
export const items = sqliteTable("items", {
  id: id(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ─── Service Item Prices (per-item price overrides for item/sqft services) ────
// A service's own `price` is the base/default rate, and the only rate used for
// kg-billed services. For item/sqft-billed services, a row here overrides the
// base price for one specific item; items with no row here just use the base.
export const serviceItemPrices = sqliteTable("service_item_prices", {
  id: id(),
  serviceId: integer("service_id")
    .notNull()
    .references(() => services.id),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id),
  price: money("price").notNull(),
  createdAt: createdAt(),
});

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers = sqliteTable("customers", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  address: text("address"),
  totalDue: money("total_due").notNull().default("0"),
  createdAt: createdAt(),
});

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orders = sqliteTable("orders", {
  id: id(),
  orderCode: text("order_code").notNull().unique(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  status: text("status").notNull().default("pending"), // pending | ready | delivered | cancelled
  deliveryDate: date("delivery_date").notNull(),
  shelfNumber: text("shelf_number"),
  notes: text("notes"),
  totalAmount: money("total_amount").notNull().default("0"),
  paidAmount: money("paid_amount").notNull().default("0"),
  dueAmount: money("due_amount").notNull().default("0"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});

// ─── Order Items ──────────────────────────────────────────────────────────────
export const orderItems = sqliteTable("order_items", {
  id: id(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  itemId: integer("item_id").references(() => items.id),
  serviceId: integer("service_id").references(() => services.id),
  itemName: text("item_name").notNull(),
  serviceName: text("service_name").notNull(),
  unit: text("unit").notNull().default("item"), // 'item' | 'kg' | 'sqft'
  quantity: money("quantity").notNull().default("1"),
  price: money("price").notNull().default("0"),
  subtotal: money("subtotal").notNull().default("0"),
  // For kg-billed lines: JSON array of the items/quantities in this load
  // (e.g. `[{"itemId":1,"itemName":"Shirt","quantity":2}]`), record-keeping
  // only — billing is driven by `quantity` (= total weight in kg) × `price`.
  itemBreakdown: text("item_breakdown"),
  delivered: boolean("delivered").notNull().default(false),
  deliveredAt: timestamp("delivered_at"),
  barcodePrinted: boolean("barcode_printed").notNull().default(false),
  createdAt: createdAt(),
});

// ─── Payments ─────────────────────────────────────────────────────────────────
export const payments = sqliteTable("payments", {
  id: id(),
  orderId: integer("order_id").references(() => orders.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  amount: money("amount").notNull(),
  method: text("method").notNull().default("cash"), // cash | card | upi | other
  note: text("note"),
  paymentType: text("payment_type").notNull().default("order"), // order | outstanding
  createdAt: createdAt(),
});

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  id: id(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

// ─── Accounts (chart of accounts) ──────────────────────────────────────────────
export const accounts = sqliteTable("accounts", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // asset | liability | equity | expense
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ─── Vendors ────────────────────────────────────────────────────────────────────
export const vendors = sqliteTable("vendors", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// ─── Journal Entries (ledger header) ───────────────────────────────────────────
export const journalEntries = sqliteTable("journal_entries", {
  id: id(),
  reference: text("reference").notNull().unique(),
  entryDate: date("entry_date").notNull(),
  description: text("description"),
  sourceType: text("source_type").notNull(), // expense | expense_payment | expense_void | payment | closing
  sourceId: integer("source_id"),
  createdAt: createdAt(),
});

// ─── Journal Entry Lines (ledger debit/credit lines) ───────────────────────────
export const journalEntryLines = sqliteTable("journal_entry_lines", {
  id: id(),
  journalEntryId: integer("journal_entry_id")
    .notNull()
    .references(() => journalEntries.id),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  debit: money("debit").notNull().default("0"),
  credit: money("credit").notNull().default("0"),
  createdAt: createdAt(),
});

// ─── Expenses ───────────────────────────────────────────────────────────────────
export const expenses = sqliteTable("expenses", {
  id: id(),
  expenseCode: text("expense_code").notNull().unique(),
  date: date("date").notNull(),
  amount: money("amount").notNull(),
  description: text("description").notNull(),
  categoryAccountId: integer("category_account_id")
    .notNull()
    .references(() => accounts.id),
  vendorId: integer("vendor_id").references(() => vendors.id),
  paymentMethod: text("payment_method").notNull(), // cash | bank | credit
  status: text("status").notNull().default("pending"), // pending | paid | cancelled ("overdue" is derived)
  dueDate: date("due_date"),
  paidDate: timestamp("paid_date"),
  paidMethod: text("paid_method"), // cash | bank
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
});
