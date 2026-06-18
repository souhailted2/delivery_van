# Production migrations (manual)

The deploy pipeline does **not** run migrations. Apply these by hand to the
production Postgres (`erpvansales`) on the Hetzner host.

## 0001 — sync_state + sync epoch (P0-2 resurrection protection)

### Deployment order (important)
1. **Apply the migration first** — `psql "$DATABASE_URL" -f 0001_sync_state_epoch.up.sql`.
   (Applying before the code deploy is safe: the new code reads epoch 0 until the
   table exists, then 2 immediately after. Applying first means the gate is live
   the moment the new build starts.)
2. **Deploy the api-server build** that contains the epoch gate (`getSyncEpoch`,
   pull `epoch` field, push 409 gate).
3. **Release the desktop installer + mobile APK** carrying the client epoch logic
   (pull-epoch wipe, push-epoch, 409 handling).

### Rollback
`psql "$DATABASE_URL" -f 0001_sync_state_epoch.down.sql` — drops `sync_state`;
the code falls back to epoch 0 (gate inactive). No restart needed, no data loss.

### Validation (run after step 2)
```sql
SELECT * FROM sync_state;                 -- expect (1, 2)
```
```bash
# pull returns the epoch:
curl -s -b "$COOKIE" "$BASE/api/sync/v2/pull?since=1970-01-01T00:00:00.000Z" | jq .epoch     # -> 2
# stale-epoch push is rejected:
curl -s -o /dev/null -w "%{http_code}\n" -b "$COOKIE" -H 'content-type: application/json' \
     -d '{"epoch":1,"tables":{}}' "$BASE/api/sync/v2/push"                                   # -> 409
# current-epoch push is accepted:
curl -s -o /dev/null -w "%{http_code}\n" -b "$COOKIE" -H 'content-type: application/json' \
     -d '{"epoch":2,"tables":{}}' "$BASE/api/sync/v2/push"                                   # -> 200
```

### IMPORTANT — un-updated old clients
The gate only rejects pushes that **carry** a mismatched epoch. Old clients that
don't yet send an epoch are NOT gated (safe, gradual rollout) and remain capable
of resurrection until they are updated to the epoch-aware build. Until every
device is updated, keep performing the operational device-wipe for any device
that synced before 2026-06-15. To force the issue, the gate can later be
tightened to also reject pushes that send **no** epoch once `serverEpoch > 0`.
