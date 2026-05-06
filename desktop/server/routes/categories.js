const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

router.get("/categories", (_req, res) => {
  const db = getDb();
  const cats = db.prepare("SELECT * FROM categories ORDER BY name").all();
  res.json(cats.map(c => ({ ...c, createdAt: c.created_at })));
});

router.post("/categories", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const db = getDb();
  const info = db.prepare("INSERT INTO categories (name) VALUES (?)").run(name);
  const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ ...cat, createdAt: cat.created_at });
});

router.put("/categories/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { name } = req.body;
  const db = getDb();
  db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, id);
  const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(id);
  if (!cat) return res.status(404).json({ error: "Catégorie non trouvée" });
  res.json({ ...cat, createdAt: cat.created_at });
});

router.delete("/categories/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  res.status(204).send();
});

module.exports = router;
