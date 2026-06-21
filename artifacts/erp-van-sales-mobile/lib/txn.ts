import { getDb } from "./db";
import { newSyncId } from "./uuid";
import { canonicalizeTruckStock } from "./truckStock";

/**
 * Local, offline-first money/stock operations that ride the existing sync rails.
 * Each writes a syncable row (_pending=1) and applies the SAME optimistic local
 * effect the cloud will reconcile authoritatively on push, with updated_at bumped
 * so the pre-push pull (pull-then-push) doesn't revert it. Sign convention:
 * credit_balance is negative for debt — collecting/returning moves it toward 0.
 */

export interface TxnClient { sync_id: string; id?: number | null }

/** تحصيل دفعة — collect a cash payment from a client against their debt. */
export async function collectClientPayment(opts: {
  client: TxnClient;
  truckId: number | null;
  truckSyncId?: string | null;
  amount: number;
  note?: string | null;
}): Promise<boolean> {
  const amount = Number(opts.amount);
  if (!(amount > 0)) return false;
  const db = await getDb();
  if (!db) return false;
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO client_payments
       (sync_id, truck_id, truck_sync_id, client_id, client_sync_id, amount, method, note,
        created_at, updated_at, is_deleted, _pending)
     VALUES (?, ?, ?, ?, ?, ?, 'cash', ?, ?, ?, 0, 1)`,
    [newSyncId(), opts.truckId, opts.truckSyncId ?? null, opts.client.id ?? null,
      opts.client.sync_id, amount, opts.note ?? null, now, now] as any[],
  );
  // Reduce the client's debt locally (credit_balance += amount → toward 0).
  await db.runAsync(
    `UPDATE clients SET credit_balance = COALESCE(credit_balance,0) + ?, updated_at = ?, _pending = 1
     WHERE sync_id = ? OR (id IS NOT NULL AND id = ?)`,
    [amount, now, opts.client.sync_id, opts.client.id ?? -1] as any[],
  );
  // Add the collected cash to the truck (trucks isn't pushed; server reconciles).
  if (opts.truckId != null) {
    await db.runAsync(
      `UPDATE trucks SET cash_balance = COALESCE(cash_balance,0) + ?, updated_at = ? WHERE id = ?`,
      [amount, now, opts.truckId] as any[],
    );
  }
  return true;
}

export interface ReturnLine {
  product_id: number | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
}

export interface TxnInvoice {
  sync_id: string;
  id?: number | null;
  client_id?: number | null;
  client_sync_id?: string | null;
  payment_type?: string | null;
}

/**
 * إلغاء / مرتجع — create a return (type "void" cancels the whole invoice and
 * soft-deletes it locally; "client_return" returns selected items). Restores
 * stock to the truck and reverses the money against the original invoice.
 */
export async function createReturn(opts: {
  type: "void" | "client_return";
  invoice: TxnInvoice;
  truckId: number | null;
  truckSyncId?: string | null;
  lines: ReturnLine[];
}): Promise<boolean> {
  const lines = opts.lines.filter(l => Number(l.quantity) > 0);
  if (!lines.length) return false;
  const db = await getDb();
  if (!db) return false;
  const now = new Date().toISOString();
  const retSyncId = newSyncId();
  const total = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);

  await db.runAsync(
    `INSERT INTO returns
       (sync_id, type, truck_id, truck_sync_id, client_id, client_sync_id, invoice_id, invoice_sync_id,
        total_amount, created_at, updated_at, is_deleted, _pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [retSyncId, opts.type, opts.truckId, opts.truckSyncId ?? null,
      opts.invoice.client_id ?? null, opts.invoice.client_sync_id ?? null,
      opts.invoice.id ?? null, opts.invoice.sync_id, total, now, now] as any[],
  );

  for (const l of lines) {
    await db.runAsync(
      `INSERT INTO return_items
         (sync_id, return_sync_id, product_id, product_name, quantity, unit_price, subtotal, updated_at, _pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [newSyncId(), retSyncId, l.product_id, l.product_name, l.quantity, l.unit_price,
        Number(l.quantity) * Number(l.unit_price), now] as any[],
    );
    if (opts.truckId != null && l.product_id != null) {
      await canonicalizeTruckStock(db, opts.truckId, l.product_id, Number(l.quantity), now);
    }
  }

  // Reverse the money: credit sale → reduce the client's debt; cash sale → remove
  // the refunded cash from the truck.
  if (opts.invoice.payment_type === "credit") {
    await db.runAsync(
      `UPDATE clients SET credit_balance = COALESCE(credit_balance,0) + ?, updated_at = ?, _pending = 1
       WHERE sync_id = ? OR (id IS NOT NULL AND id = ?)`,
      [total, now, opts.invoice.client_sync_id ?? "", opts.invoice.client_id ?? -1] as any[],
    );
  } else if (opts.truckId != null) {
    await db.runAsync(
      `UPDATE trucks SET cash_balance = MAX(0, COALESCE(cash_balance,0) - ?), updated_at = ? WHERE id = ?`,
      [total, now, opts.truckId] as any[],
    );
  }

  // A void hides the original invoice locally; updated_at bump protects it from
  // the pre-push pull. The cloud soft-deletes its copy via the void reconciliation.
  if (opts.type === "void") {
    await db.runAsync(
      `UPDATE invoices SET is_deleted = 1, updated_at = ?, _pending = 1 WHERE sync_id = ?`,
      [now, opts.invoice.sync_id] as any[],
    );
  }
  return true;
}
