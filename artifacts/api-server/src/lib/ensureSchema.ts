import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Idempotent, ADDITIVE runtime schema guard for tables introduced after the
 * last hand-applied migration. `CREATE TABLE IF NOT EXISTS` only — it never
 * alters or drops an existing table, so it is safe to run on every boot.
 *
 * This lets an additive feature (here: client_payments — migration 0002) ship
 * without a separate manual `psql` step: the table is created on the next pm2
 * reload during deploy, BEFORE the sync routes query it (so pull/push can never
 * 500 on a missing table). The canonical migration files remain under
 * artifacts/api-server/migrations for environments that apply them by hand.
 *
 * Keep this strictly additive. Real schema changes (column type/default
 * changes, drops) must still go through a reviewed migration.
 */
export async function ensureRuntimeSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_payments (
      id          serial PRIMARY KEY,
      truck_id    integer REFERENCES trucks(id),
      client_id   integer NOT NULL REFERENCES clients(id),
      amount      numeric(12,2) NOT NULL,
      method      text NOT NULL DEFAULT 'cash',
      note        text,
      created_at  timestamp NOT NULL DEFAULT now(),
      sync_id     text UNIQUE DEFAULT (gen_random_uuid()::text),
      updated_at  timestamp NOT NULL DEFAULT now(),
      is_deleted  boolean NOT NULL DEFAULT false
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS client_payments_client_idx     ON client_payments(client_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS client_payments_truck_idx      ON client_payments(truck_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS client_payments_updated_at_idx ON client_payments(updated_at)`);
}
