// Starting data for a brand-new database (no legacy JSON file to import).
// Ids are fixed so the core accounts keep the same ids the old offline store
// used (SALES is 13), in case anything was ever keyed off them.
const now = () => new Date().toISOString();

export const DEFAULT_DATA: Record<string, Array<Record<string, unknown>>> = {
  services: [
    { id: 1, name: "Wash & Fold", unit: "kg", price: "30", active: true, createdAt: now() },
    { id: 2, name: "Ironing", unit: "item", price: "20", active: true, createdAt: now() },
    { id: 3, name: "Dry Cleaning", unit: "item", price: "60", active: true, createdAt: now() },
  ],
  items: [
    { id: 1, name: "Shirt", active: true, createdAt: now() },
    { id: 2, name: "Pant", active: true, createdAt: now() },
    { id: 3, name: "Suit", active: true, createdAt: now() },
    { id: 4, name: "Bedsheet", active: true, createdAt: now() },
  ],
  accounts: [
    { id: 1, code: "CASH", name: "Cash", type: "asset", active: true, createdAt: now() },
    { id: 2, code: "BANK", name: "Bank", type: "asset", active: true, createdAt: now() },
    { id: 3, code: "AP", name: "Accounts Payable", type: "liability", active: true, createdAt: now() },
    { id: 4, code: "CAPITAL", name: "Owner's Capital", type: "equity", active: true, createdAt: now() },
    { id: 13, code: "SALES", name: "Sales Revenue", type: "income", active: true, createdAt: now() },
    { id: 5, code: "EXP-RENT", name: "Rent", type: "expense", active: true, createdAt: now() },
    { id: 6, code: "EXP-UTIL", name: "Utilities", type: "expense", active: true, createdAt: now() },
    { id: 7, code: "EXP-SALARY", name: "Salaries & Wages", type: "expense", active: true, createdAt: now() },
    { id: 8, code: "EXP-SUPPLY", name: "Supplies", type: "expense", active: true, createdAt: now() },
    { id: 9, code: "EXP-MAINT", name: "Maintenance & Repairs", type: "expense", active: true, createdAt: now() },
    { id: 10, code: "EXP-TRANSPORT", name: "Transport", type: "expense", active: true, createdAt: now() },
    { id: 11, code: "EXP-MARKETING", name: "Marketing", type: "expense", active: true, createdAt: now() },
    { id: 12, code: "EXP-MISC", name: "Miscellaneous", type: "expense", active: true, createdAt: now() },
  ],
};
