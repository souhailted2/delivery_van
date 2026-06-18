-- =============================================================================
-- Rollback 0001 — remove sync_state (disables the P0-2 epoch gate)
-- =============================================================================
-- SAFE: the api-server's getSyncEpoch() falls back to 0 when this table is
-- absent, which DISABLES the epoch gate (pushes are no longer epoch-checked).
-- No application restart required; no data loss (sync_state holds only the
-- epoch counter). Run this only if the epoch feature must be reverted.

DROP TABLE IF EXISTS sync_state;
