-- =============================================================================
-- Migration 0001 — sync_state + sync epoch  (P0-2 resurrection protection)
-- Apply to production Postgres (database: erpvansales).
-- Idempotent: safe to run more than once.
-- =============================================================================
--
-- WHY: a destructive factory reset (2026-06-15) HARD-deleted rows. A device that
-- synced before the reset still holds those rows; if it pushes them, the cloud
-- upsert's ON CONFLICT(sync_id) misses (the sync_id is gone) and INSERTs them,
-- RESURRECTING deleted data. The sync epoch lets the server reject stale-epoch
-- pushes and tell the client to wipe + re-pull.
--
-- The api-server reads this via getSyncEpoch(); if this table is ABSENT it
-- returns 0 and the epoch gate is INACTIVE (no behaviour change). So applying
-- this migration is what ACTIVATES P0-2 protection.

CREATE TABLE IF NOT EXISTS sync_state (
  id    integer PRIMARY KEY DEFAULT 1,
  epoch integer NOT NULL DEFAULT 1,
  CONSTRAINT sync_state_singleton CHECK (id = 1)
);

-- Seed the singleton at epoch = 2 (i.e. bump past 1) so EVERY device that synced
-- before the 2026-06-15 reset (epoch 1 / no epoch) is forced to wipe + re-pull
-- before it may push again. Never lower the epoch on re-run.
INSERT INTO sync_state (id, epoch) VALUES (1, 2)
  ON CONFLICT (id) DO UPDATE SET epoch = GREATEST(sync_state.epoch, 2);

-- To perform a FUTURE destructive reset: bump the epoch by 1, e.g.
--   UPDATE sync_state SET epoch = epoch + 1 WHERE id = 1;
