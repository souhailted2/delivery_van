import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/categories", async (_req, res) => {
  const cats = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  res.json(cats);
});

router.post("/categories", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const [cat] = await db.insert(categoriesTable).values({ name }).returning();
  res.status(201).json(cat);
});

router.put("/categories/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name } = req.body;
  const [cat] = await db.update(categoriesTable).set({ name }).where(eq(categoriesTable.id, id)).returning();
  if (!cat) return res.status(404).json({ error: "Catégorie non trouvée" });
  res.json(cat);
});

router.delete("/categories/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
  res.status(204).send();
});

export default router;
