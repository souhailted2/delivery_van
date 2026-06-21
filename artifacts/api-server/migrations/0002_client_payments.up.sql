-- =============================================================================
-- Migration 0002 — client_payments  (تحصيل دفعة / collect client payment)
-- Apply to production Postgres (database: erpvansales).
-- Idempotent: safe to run more than once.
-- =============================================================================
--
-- WHY: drivers need to record a cash payment collected from a client against the
-- client's outstanding debt. This is a new syncable table. The cloud reconciles
-- each newly-pushed payment exactly once (RETURNING-gated):
--   clients.balance      += amount   (balance is negative for debt → toward 0)
--   trucks.cash_balance  += amount   (the cash is now on the truck)
--
-- DEPLOYMENT ORDER: apply this migration BEFORE deploying the api-server build
-- that references client_payments — otherwise pushes to that table 500 until the
-- table exists. (Mobile/desktop keep the rows pending and retry, so it self-heals,
-- but applying first avoids the noise.)

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
);

CREATE INDEX IF NOT EXISTS client_payments_client_idx     ON client_payments(client_id);
CREATE INDEX IF NOT EXISTS client_payments_truck_idx      ON client_payments(truck_id);
CREATE INDEX IF NOT EXISTS client_payments_updated_at_idx ON client_payments(updated_at);
