const { Router } = require("express");
const { getDb, hashPassword } = require("../db");

const router = Router();

function truckFromSession(req) {
  return req.session?.truckId ?? null;
}

function formatTruck(t) {
  return {
    id: t.id, name: t.name, plateNumber: t.plate_number,
    vendeurId: t.vendeur_id, vendeurName: t.vendeur_name,
    driverName: t.driver_name, location: t.location,
    cashBalance: Number(t.cash_balance ?? 0),
    latitude: t.latitude, longitude: t.longitude, createdAt: t.created_at,
  };
}

// --- Admin: Trucks CRUD ---

router.get("/trucks", (_req, res) => {
  const db = getDb();
  const trucks = db.prepare(`
    SELECT t.*, u.full_name AS vendeur_name
    FROM trucks t LEFT JOIN users u ON t.vendeur_id = u.id
    ORDER BY t.name
  `).all();
  res.json(trucks.map(formatTruck));
});

router.post("/trucks", (req, res) => {
  const { name, plateNumber, vendeurId, driverName, password, location } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO trucks (name, plate_number, vendeur_id, driver_name, password_hash, location, cash_balance)
    VALUES (?,?,?,?,?,?,0)
  `).run(name, plateNumber || null, vendeurId || null, driverName || null,
    password ? hashPassword(password) : null, location || null);
  const t = db.prepare(`
    SELECT t.*, u.full_name AS vendeur_name FROM trucks t
    LEFT JOIN users u ON t.vendeur_id = u.id WHERE t.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json(formatTruck(t));
});

router.get("/trucks/:id", (req, res) => {
  const db = getDb();
  const t = db.prepare(`
    SELECT t.*, u.full_name AS vendeur_name FROM trucks t
    LEFT JOIN users u ON t.vendeur_id = u.id WHERE t.id = ?
  `).get(parseInt(req.params.id));
  if (!t) return res.status(404).json({ error: "Camion non trouvé" });
  res.json(formatTruck(t));
});

router.put("/trucks/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { name, plateNumber, vendeurId, driverName, password, location } = req.body;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM trucks WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Camion non trouvé" });
  db.prepare(`UPDATE trucks SET
    name = COALESCE(?,name), plate_number = COALESCE(?,plate_number),
    vendeur_id = COALESCE(?,vendeur_id), driver_name = COALESCE(?,driver_name),
    location = COALESCE(?,location),
    password_hash = COALESCE(?,password_hash)
    WHERE id = ?`).run(
    name ?? null, plateNumber ?? null, vendeurId ?? null, driverName ?? null,
    location ?? null, password ? hashPassword(password) : null, id);
  const t = db.prepare(`
    SELECT t.*, u.full_name AS vendeur_name FROM trucks t
    LEFT JOIN users u ON t.vendeur_id = u.id WHERE t.id = ?
  `).get(id);
  res.json(formatTruck(t));
});

router.delete("/trucks/:id", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM trucks WHERE id = ?").run(parseInt(req.params.id));
  res.status(204).send();
});

router.get("/trucks/:id/stock", (req, res) => {
  const db = getDb();
  const stock = db.prepare(`
    SELECT ts.product_id, p.name AS product_name, ts.quantity, p.unit
    FROM truck_stock ts LEFT JOIN products p ON ts.product_id = p.id
    WHERE ts.truck_id = ?
  `).all(parseInt(req.params.id));
  res.json(stock.map(s => ({ productId: s.product_id, productName: s.product_name, quantity: Number(s.quantity), unit: s.unit })));
});

// --- Truck-self routes (truck session) ---

router.get("/trucks/me/stock", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const db = getDb();
  const stock = db.prepare(`
    SELECT ts.product_id, p.name AS product_name, ts.quantity, p.unit, p.image_url,
      p.selling_price_retail, p.selling_price_half_wholesale, p.selling_price_wholesale
    FROM truck_stock ts LEFT JOIN products p ON ts.product_id = p.id
    WHERE ts.truck_id = ?
  `).all(truckId);
  res.json(stock.map(s => ({
    productId: s.product_id, productName: s.product_name, quantity: Number(s.quantity),
    unit: s.unit, imageUrl: s.image_url,
    sellingPriceRetail: Number(s.selling_price_retail ?? 0),
    sellingPriceHalfWholesale: Number(s.selling_price_half_wholesale ?? 0),
    sellingPriceWholesale: Number(s.selling_price_wholesale ?? 0),
  })));
});

router.get("/trucks/me/clients", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const db = getDb();
  const clients = db.prepare("SELECT * FROM clients WHERE truck_id = ? ORDER BY name").all(truckId);
  res.json(clients.map(c => ({
    id: c.id, name: c.name, phone: c.phone, clientType: c.client_type,
    truckId: c.truck_id, latitude: c.latitude, longitude: c.longitude,
    balance: Number(c.balance ?? 0), createdAt: c.created_at,
  })));
});

router.post("/trucks/me/clients", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const { name, phone, clientType, latitude, longitude } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO clients (name, phone, client_type, truck_id, latitude, longitude, balance)
    VALUES (?,?,?,?,?,?,0)
  `).run(name, phone || null, validTypes.includes(clientType) ? clientType : "retail",
    truckId, latitude || null, longitude || null);
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ ...client, clientType: client.client_type, truckId: client.truck_id, balance: Number(client.balance), createdAt: client.created_at });
});

router.put("/trucks/me/clients/:id", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const clientId = parseInt(req.params.id);
  const { name, phone, clientType } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const db = getDb();
  const existing = db.prepare("SELECT * FROM clients WHERE id = ? AND truck_id = ?").get(clientId, truckId);
  if (!existing) return res.status(404).json({ error: "Client non trouvé" });
  db.prepare(`UPDATE clients SET name = ?, phone = ?,
    client_type = ? WHERE id = ?`).run(
    name, phone || null,
    validTypes.includes(clientType) ? clientType : existing.client_type, clientId);
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId);
  res.json({ ...client, clientType: client.client_type, truckId: client.truck_id, balance: Number(client.balance), createdAt: client.created_at });
});

router.get("/trucks/me/vendeurs", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const db = getDb();
  const vendeurs = db.prepare(`
    SELECT id,username,full_name,role,truck_id,can_delete_invoice,can_edit_price,
      can_sell_on_credit,can_view_reports,created_at
    FROM users WHERE truck_id = ? AND role = 'vendeur' ORDER BY id
  `).all(truckId);
  res.json(vendeurs.map(u => ({
    id: u.id, username: u.username, fullName: u.full_name, role: u.role,
    truckId: u.truck_id, canDeleteInvoice: !!u.can_delete_invoice,
    canEditPrice: !!u.can_edit_price, canSellOnCredit: !!u.can_sell_on_credit,
    canViewReports: !!u.can_view_reports, createdAt: u.created_at,
  })));
});

router.post("/trucks/me/vendeurs", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const { username, password, fullName } = req.body;
  if (!username || !password || !fullName) return res.status(400).json({ error: "Champs requis manquants" });
  const db = getDb();
  try {
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, truck_id,
        can_delete_invoice, can_edit_price, can_sell_on_credit, can_view_reports)
      VALUES (?,?,?,'vendeur',?,0,0,1,0)
    `).run(username, hashPassword(password), fullName, truckId);
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json({
      id: u.id, username: u.username, fullName: u.full_name, role: u.role, truckId: u.truck_id,
      canDeleteInvoice: false, canEditPrice: false, canSellOnCredit: true, canViewReports: false, createdAt: u.created_at,
    });
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(409).json({ error: "Nom d'utilisateur déjà pris" });
    throw err;
  }
});

router.post("/trucks/me/invoices", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const { clientId, newClient, paymentType, latitude, longitude, items } = req.body;
  if (!items?.length) return res.status(400).json({ error: "Articles requis" });
  if (!clientId && !newClient?.name) return res.status(400).json({ error: "Client requis" });
  const db = getDb();

  const createInvoice = db.transaction(() => {
    let resolvedClientId = clientId;
    if (clientId) {
      const existing = db.prepare("SELECT * FROM clients WHERE id = ? AND truck_id = ?").get(clientId, truckId);
      if (!existing) throw { status: 403, message: "Client non autorisé" };
    }
    if (!clientId && newClient) {
      const validTypes = ["retail", "half_wholesale", "wholesale"];
      const info = db.prepare(`
        INSERT INTO clients (name, phone, client_type, truck_id, balance)
        VALUES (?,?,?,?,0)
      `).run(newClient.name.trim(), newClient.phone || null,
        validTypes.includes(newClient.clientType) ? newClient.clientType : "retail", truckId);
      resolvedClientId = info.lastInsertRowid;
    }

    const invoiceNumber = `FAC-${Date.now()}`;
    const invInfo = db.prepare(`
      INSERT INTO invoices (invoice_number, truck_id, client_id, payment_type, total_amount, total_commission, latitude, longitude)
      VALUES (?,?,?,?,0,0,?,?)
    `).run(invoiceNumber, truckId, resolvedClientId, paymentType || "cash", latitude || null, longitude || null);
    const invoiceId = invInfo.lastInsertRowid;

    let totalAmount = 0;
    let totalCommission = 0;
    for (const item of items) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const subtotal = qty * unitPrice;
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(parseInt(item.productId));
      let commissionRate = 0;
      if (product) {
        if (item.priceType === "retail") commissionRate = Number(product.commission_retail);
        else if (item.priceType === "half_wholesale") commissionRate = Number(product.commission_half);
        else if (item.priceType === "wholesale") commissionRate = Number(product.commission_wholesale);
      }
      const commission = (subtotal * commissionRate) / 100;
      db.prepare(`INSERT INTO invoice_items (invoice_id,product_id,quantity,price_type,unit_price,commission,subtotal) VALUES (?,?,?,?,?,?,?)`)
        .run(invoiceId, parseInt(item.productId), qty, item.priceType || "retail", unitPrice, commission, subtotal);
      totalAmount += subtotal;
      totalCommission += commission;
      const ts = db.prepare("SELECT * FROM truck_stock WHERE truck_id = ? AND product_id = ?").get(truckId, parseInt(item.productId));
      if (ts) {
        db.prepare("UPDATE truck_stock SET quantity = ? WHERE id = ?").run(Math.max(0, Number(ts.quantity) - qty), ts.id);
      }
    }

    db.prepare("UPDATE invoices SET total_amount = ?, total_commission = ? WHERE id = ?").run(totalAmount, totalCommission, invoiceId);
    if ((paymentType || "cash") === "cash") {
      const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(truckId);
      if (truck) db.prepare("UPDATE trucks SET cash_balance = ? WHERE id = ?").run(Number(truck.cash_balance) + totalAmount, truckId);
    }
    if (paymentType === "credit") {
      const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(resolvedClientId);
      if (client) db.prepare("UPDATE clients SET balance = ? WHERE id = ?").run(Number(client.balance) - totalAmount, resolvedClientId);
    }
    return invoiceId;
  });

  try {
    const invoiceId = createInvoice();
    const inv = db.prepare(`
      SELECT i.*, t.name AS truck_name, c.name AS client_name
      FROM invoices i LEFT JOIN trucks t ON i.truck_id = t.id LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `).get(invoiceId);
    res.status(201).json({
      id: inv.id, invoiceNumber: inv.invoice_number, truckId: inv.truck_id, truckName: inv.truck_name,
      clientId: inv.client_id, clientName: inv.client_name, paymentType: inv.payment_type,
      totalAmount: Number(inv.total_amount), totalCommission: Number(inv.total_commission),
      latitude: inv.latitude, longitude: inv.longitude, createdAt: inv.created_at, items: [],
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.get("/trucks/me/invoices", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const db = getDb();
  const invoices = db.prepare(`
    SELECT i.*, t.name AS truck_name, c.name AS client_name
    FROM invoices i LEFT JOIN trucks t ON i.truck_id = t.id LEFT JOIN clients c ON i.client_id = c.id
    WHERE i.truck_id = ? ORDER BY i.created_at
  `).all(truckId);
  res.json(invoices.map(i => ({
    id: i.id, invoiceNumber: i.invoice_number, truckId: i.truck_id, truckName: i.truck_name,
    clientId: i.client_id, clientName: i.client_name, paymentType: i.payment_type,
    totalAmount: Number(i.total_amount), totalCommission: Number(i.total_commission),
    latitude: i.latitude, longitude: i.longitude, createdAt: i.created_at, items: [],
  })));
});

router.get("/trucks/me/invoices/:id", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const invoiceId = parseInt(req.params.id);
  const db = getDb();
  const inv = db.prepare(`
    SELECT i.*, t.name AS truck_name, c.name AS client_name
    FROM invoices i LEFT JOIN trucks t ON i.truck_id = t.id LEFT JOIN clients c ON i.client_id = c.id
    WHERE i.id = ? AND i.truck_id = ?
  `).get(invoiceId, truckId);
  if (!inv) return res.status(404).json({ error: "Facture non trouvée" });
  const items = db.prepare(`
    SELECT ii.*, p.name AS product_name FROM invoice_items ii
    LEFT JOIN products p ON ii.product_id = p.id WHERE ii.invoice_id = ?
  `).all(invoiceId);
  res.json({
    id: inv.id, invoiceNumber: inv.invoice_number, truckId: inv.truck_id, truckName: inv.truck_name,
    clientId: inv.client_id, clientName: inv.client_name, paymentType: inv.payment_type,
    totalAmount: Number(inv.total_amount), totalCommission: Number(inv.total_commission),
    latitude: inv.latitude, longitude: inv.longitude, createdAt: inv.created_at,
    items: items.map(it => ({
      id: it.id, productId: it.product_id, productName: it.product_name,
      quantity: Number(it.quantity), priceType: it.price_type,
      unitPrice: Number(it.unit_price), commission: Number(it.commission), subtotal: Number(it.subtotal),
    })),
  });
});

router.get("/trucks/me/cash", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const db = getDb();
  const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(truckId);
  if (!truck) return res.status(404).json({ error: "Camion non trouvé" });
  const allInvoices = db.prepare("SELECT payment_type, total_amount FROM invoices WHERE truck_id = ?").all(truckId);
  const totalCashSales = allInvoices.filter(i => i.payment_type === "cash").reduce((s, i) => s + Number(i.total_amount), 0);
  const transfers = db.prepare("SELECT * FROM cash_transfers WHERE truck_id = ? ORDER BY created_at").all(truckId);
  const totalTransferred = transfers.filter(t => t.status === "approved").reduce((s, t) => s + Number(t.amount), 0);
  const pendingAmount = transfers.filter(t => t.status === "pending").reduce((s, t) => s + Number(t.amount), 0);
  res.json({
    truckId: truck.id, truckName: truck.name, cashBalance: Number(truck.cash_balance),
    totalCashSales, totalTransferred, pendingAmount,
    transfers: transfers.map(t => ({ ...t, amount: Number(t.amount), truckName: truck.name, createdAt: t.created_at })),
  });
});

router.post("/trucks/me/cash/transfer", (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const { amount, note } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Montant invalide" });
  const db = getDb();
  const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(truckId);
  if (!truck) return res.status(404).json({ error: "Camion non trouvé" });
  if (Number(amount) > Number(truck.cash_balance)) {
    return res.status(400).json({ error: "Montant supérieur au solde disponible" });
  }
  const info = db.prepare("INSERT INTO cash_transfers (truck_id, amount, status, note) VALUES (?,?,'pending',?)")
    .run(truckId, Number(amount), note?.trim() || null);
  const transfer = db.prepare("SELECT * FROM cash_transfers WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ ...transfer, amount: Number(transfer.amount), truckName: truck.name, createdAt: transfer.created_at });
});

module.exports = router;
