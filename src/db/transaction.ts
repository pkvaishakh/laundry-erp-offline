import { AsyncLocalStorage } from "node:async_hooks";
import { getSqlite } from "./index";

// Every API request that writes runs inside one SQLite transaction: it is
// saved completely or not at all (an order can never be left without its
// items, or a payment without its ledger entry). The app shares a single
// connection, so write requests are queued and run one at a time — otherwise
// another request's writes would land inside this transaction and be rolled
// back with it. Kept on globalThis because `next dev` bundles each route
// separately.
interface TxState {
  queue: Promise<unknown>;
  als: AsyncLocalStorage<true>;
}
const txGlobal = globalThis as unknown as { __laundryTx?: TxState };
const state: TxState = (txGlobal.__laundryTx ??= {
  queue: Promise.resolve(),
  als: new AsyncLocalStorage<true>(),
});

export function runInWriteTransaction<T>(fn: () => Promise<T>, shouldCommit: (result: T) => boolean = () => true): Promise<T> {
  // Already inside a write transaction (nested helper call): join it.
  if (state.als.getStore()) return fn();

  const run = state.queue.then(() =>
    state.als.run(true, async () => {
      const sqlite = getSqlite();
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        sqlite.exec(shouldCommit(result) ? "COMMIT" : "ROLLBACK");
        return result;
      } catch (err) {
        if (sqlite.isTransaction) sqlite.exec("ROLLBACK");
        throw err;
      }
    })
  );
  state.queue = run.catch(() => {});
  return run;
}

/**
 * Wraps a route handler (POST/PUT/PATCH/DELETE) so the whole request is one
 * transaction. An error response (4xx/5xx) or a thrown error rolls back every
 * write the request made.
 */
export function withWriteTransaction<A extends unknown[], R extends Response>(handler: (...args: A) => Promise<R>) {
  return (...args: A): Promise<R> => runInWriteTransaction(() => handler(...args), (res) => res.status < 400);
}
