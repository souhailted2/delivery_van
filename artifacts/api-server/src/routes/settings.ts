import { Router } from "express";
import { db } from "@workspace/db";
import { companySettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function getOrCreateSettings() {
  const [existing] = await db.select().from(companySettingsTable).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(companySettingsTable).values({
    storeName: "VanSales ERP",
    phone: "",
    address: "",
  }).returning();
  return created;
}

router.get("/settings/company", async (_req, res) => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

router.put("/settings/company", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "غير مصرح" });

  const [user] = await db.select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "مخصص للمدير فقط" });
  }

  const { storeName, phone, address } = req.body;
  const existing = await getOrCreateSettings();
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (storeName !== undefined) updates.storeName = storeName;
  if (phone !== undefined) updates.phone = phone;
  if (address !== undefined) updates.address = address;
  const [updated] = await db.update(companySettingsTable)
    .set(updates)
    .where(eq(companySettingsTable.id, existing.id))
    .returning();
  res.json(updated);
});

export default router;
