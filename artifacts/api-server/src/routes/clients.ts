import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, usersTable, invoicesTable, invoiceItemsTable, productsTable } from "@workspace/db";
import { eq, like, and, sum, count, desc, sql } from "drizzle-orm";

const router = Router();

async function getSessionBranchId(req: any): Promise<number | null> {
  const userId = req.session?.userId;
  if (!userId) return null;
  const [user] = await db.select({ branchId: usersTable.branchId, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;
  if (user.role === "admin" && !user.branchId) return null; // super admin
  return user.branchId ?? null;
}

router.get("/clients", async (req, res) => {
  const { search } = req.query;
  const branchId = await getSessionBranchId(req);

  const conditions = [];
  if (branchId !== null) conditions.push(eq(clientsTable.branchId, branchId));
  if (search) conditions.push(like(clientsTable.name, `%${search}%`));

  const clients = await db.select().from(clientsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(clientsTable.name);
  res.json(clients.map(c => ({ ...c, balance: Number(c.balance) })));
});

router.post("/clients", async (req, res) => {
  const { name, phone, clientType, latitude, longitude, branchId: bodyBranchId } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const sessionBranchId = await getSessionBranchId(req);
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const [client] = await db.insert(clientsTable).values({
    name, phone: phone || null,
    clientType: validTypes.includes(clientType) ? clientType : "retail",
    branchId: sessionBranchId ?? (bodyBranchId ? parseInt(bodyBranchId) : null),
    latitude: latitude || null, longitude: longitude || null,
    balance: "0",
  }).returning();
  res.status(201).json({ ...client, balance: Number(client.balance) });
});

router.get("/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!client) return res.status(404).json({ error: "Client non trouvé" });
  res.json({ ...client, balance: Number(client.balance) });
});

router.put("/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, clientType, latitude, longitude, balance, branchId } = req.body;
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (clientType !== undefined && validTypes.includes(clientType)) updates.clientType = clientType;
  if (latitude !== undefined) updates.latitude = latitude;
  if (longitude !== undefined) updates.longitude = longitude;
  if (balance !== undefined) updates.balance = String(balance);
  if (branchId !== undefined) updates.branchId = branchId || null;
  const [client] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, id)).returning();
  if (!client) return res.status(404).json({ error: "Client non trouvé" });
  res.json({ ...client, balance: Number(client.balance) });
});

router.delete("/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(clientsTable).where(eq(clientsTable.id, id));
  res.status(204).send();
});

// GET /clients/:id/profile — إحصائيات الزبون
router.get("/clients/:id/profile", async (req, res) => {
  const id = parseInt(req.params.id);

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!client) return res.status(404).json({ error: "العميل غير موجود" });

  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  // إجمالي المشتريات هذا العام (مُصفّى بالسنة)
  const [yearRow] = await db
    .select({ totalYear: sum(invoicesTable.totalAmount) })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.clientId, id),
      eq(invoicesTable.isDeleted, false),
      sql`${invoicesTable.createdAt} >= ${yearStart}`,
    ));

  // عدد الفواتير الإجمالي + عدد فواتير الآجل (كل الأوقات)
  const [statsRow] = await db
    .select({
      invoiceCount: count(invoicesTable.id),
      creditCount: sql<number>`COUNT(*) FILTER (WHERE ${invoicesTable.paymentType} = 'credit')`,
    })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.clientId, id),
      eq(invoicesTable.isDeleted, false),
    ));

  // آخر فاتورة
  const [lastInvoice] = await db
    .select({
      id: invoicesTable.id,
      totalAmount: invoicesTable.totalAmount,
      createdAt: invoicesTable.createdAt,
      paymentType: invoicesTable.paymentType,
    })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.clientId, id), eq(invoicesTable.isDeleted, false)))
    .orderBy(desc(invoicesTable.createdAt))
    .limit(1);

  // أكثر المنتجات شراءً (top 5)
  const topProducts = await db
    .select({
      productId: invoiceItemsTable.productId,
      productName: invoiceItemsTable.productName,
      totalQty: sum(invoiceItemsTable.quantity),
      totalValue: sum(invoiceItemsTable.subtotal),
    })
    .from(invoiceItemsTable)
    .innerJoin(invoicesTable, and(
      eq(invoiceItemsTable.invoiceId, invoicesTable.id),
      eq(invoicesTable.clientId, id),
      eq(invoicesTable.isDeleted, false),
    ))
    .where(eq(invoiceItemsTable.isDeleted, false))
    .groupBy(invoiceItemsTable.productId, invoiceItemsTable.productName)
    .orderBy(desc(sum(invoiceItemsTable.subtotal)))
    .limit(5);

  res.json({
    client: { ...client, balance: Number(client.balance) },
    totalYearPurchases: Number(yearRow?.totalYear ?? 0),
    invoiceCount: Number(statsRow?.invoiceCount ?? 0),
    creditInvoiceCount: Number(statsRow?.creditCount ?? 0),
    debtBalance: Number(client.balance),
    lastInvoice: lastInvoice
      ? { ...lastInvoice, totalAmount: Number(lastInvoice.totalAmount) }
      : null,
    topProducts: topProducts.map(p => ({
      productId: p.productId,
      productName: p.productName,
      totalQty: Number(p.totalQty ?? 0),
      totalValue: Number(p.totalValue ?? 0),
    })),
  });
});

export default router;
