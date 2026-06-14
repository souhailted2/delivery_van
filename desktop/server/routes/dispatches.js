/**
 * Truck dispatches (تحميل شاحنة) for the desktop app.
 *
 * The desktop's local SQLite server does not implement dispatches, and a
 * dispatch is inherently an online operation: the mobile truck receives it via
 * the CLOUD. The desktop also preserves cloud row ids on sync, so truck/product
 * ids sent from here already match the cloud. We therefore PROXY these calls to
 * the cloud api-server using the auto-sync engine's authenticated session.
 *
 * Temporary bridge until the desktop is unified onto the shared api-server code.
 */
const { Router } = require("express");
const { cloudRequest } = require("../sync-engine");

const router = Router();

function offline(res) {
  res.status(503).json({ error: "هذه العملية تتطلب اتصالاً بالخادم. تأكد من الإنترنت وإعدادات المزامنة." });
}

// List dispatches for a truck (admin view in the truck panel)
router.get("/dispatches", async (req, res) => {
  try {
    const tid = req.query.truckId;
    const r = await cloudRequest("GET", `/dispatches${tid ? `?truckId=${encodeURIComponent(tid)}` : ""}`);
    res.status(r.status).json(r.data);
  } catch {
    offline(res);
  }
});

// Create a dispatch (إرسال للشاحنة)
router.post("/dispatches", async (req, res) => {
  try {
    const r = await cloudRequest("POST", "/dispatches", req.body);
    res.status(r.status).json(r.data);
  } catch {
    offline(res);
  }
});

// Delete a pending dispatch
router.delete("/dispatches/:id", async (req, res) => {
  try {
    const r = await cloudRequest("DELETE", `/dispatches/${encodeURIComponent(req.params.id)}`);
    if (r.status === 204) return res.status(204).send();
    res.status(r.status).json(r.data ?? {});
  } catch {
    offline(res);
  }
});

// Close/archive a dispatch
router.post("/dispatches/:id/close", async (req, res) => {
  try {
    const r = await cloudRequest("POST", `/dispatches/${encodeURIComponent(req.params.id)}/close`, {});
    res.status(r.status).json(r.data);
  } catch {
    offline(res);
  }
});

module.exports = router;
