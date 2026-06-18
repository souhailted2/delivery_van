// Shared authentication / authorization middleware.
//
// The API previously relied on each route to police itself, and most data and
// mutation routes did not — so the whole ERP was reachable with no session.
// `requireAuth` is now mounted as a single global gate (routes/index.ts) in
// front of every non-public router; `requireAdmin` gates admin-only operations
// (user management, dispatch management) with a real server-side role check.

import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface SessionShape {
  userId?: number;
  truckId?: number;
}

/** Any authenticated session — an admin/vendeur user OR a truck driver. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const session = req.session as unknown as SessionShape | undefined;
  if (!session?.userId && !session?.truckId) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }
  next();
}

/**
 * Admin-only. Requires a USER session (not a truck) whose role is "admin",
 * verified against the database on each call. Truck sessions and non-admin
 * users are rejected with 403.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = req.session as unknown as SessionShape | undefined;
    if (!session?.userId) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    const [user] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, session.userId))
      .limit(1);
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "مخصص للمدير فقط" });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
