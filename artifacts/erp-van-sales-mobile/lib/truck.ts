import { SQLiteDatabase } from "expo-sqlite";

export interface TruckInfo {
  id: number;
  name: string;
  cash_balance: number;
  plate_number?: string | null;
}

/**
 * Resolves the active truck for the signed-in user.
 *
 * - Assigned truckId → queries that specific truck.
 * - No truckId → returns null; never falls back to LIMIT 1.
 *
 * This ensures the driver dashboard (truck-dashboard.tsx), the dedicated
 * stock screen (truck.tsx), and the new-sale form (invoice/new.tsx) all
 * derive stats and data from the SAME truck — or all show "no truck
 * assigned" together — rather than silently picking different trucks when
 * the assignment is missing.
 */
export async function getTruckForUser(
  db: SQLiteDatabase,
  truckId: number | null | undefined
): Promise<TruckInfo | null> {
  if (!truckId) return null;
  return db.getFirstAsync<TruckInfo>(
    "SELECT id, name, cash_balance, plate_number FROM trucks WHERE id = ? AND is_deleted = 0",
    [truckId]
  );
}
