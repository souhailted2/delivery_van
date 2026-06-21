-- =============================================================================
-- Migration 0002 — DOWN (drop client_payments)
-- =============================================================================
-- Removes the client_payments table. Any collected-payment history is lost, but
-- clients.balance / trucks.cash_balance keep whatever they were reconciled to.

DROP TABLE IF EXISTS client_payments;
