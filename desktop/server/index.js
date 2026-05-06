const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { initDb } = require("./db");
const { setUserDataPath } = require("./config");

const authRouter = require("./routes/auth");
const categoriesRouter = require("./routes/categories");
const productsRouter = require("./routes/products");
const suppliersRouter = require("./routes/suppliers");
const purchasesRouter = require("./routes/purchases");
const clientsRouter = require("./routes/clients");
const trucksRouter = require("./routes/trucks");
const stockRouter = require("./routes/stock");
const invoicesRouter = require("./routes/invoices");
const usersRouter = require("./routes/users");
const syncRouter = require("./routes/sync");
const cashRouter = require("./routes/cash");
const returnsRouter = require("./routes/returns");
const reportsRouter = require("./routes/reports");

/** Get or generate a per-installation session secret stored in userData. */
function getSessionSecret(userDataPath) {
  const secretFile = path.join(userDataPath, ".session-secret");
  if (fs.existsSync(secretFile)) {
    return fs.readFileSync(secretFile, "utf8").trim();
  }
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

function initServer(port, userDataPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(userDataPath, { recursive: true });
    setUserDataPath(userDataPath);
    initDb(userDataPath);

    const sessionSecret = getSessionSecret(userDataPath);
    const app = express();

    app.use(express.json({ limit: "20mb" }));
    app.use(express.urlencoded({ extended: true }));

    app.use(session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
    }));

    app.get("/api/healthz", (_req, res) => res.json({ status: "ok", mode: "offline" }));

    app.use("/api", authRouter);
    app.use("/api", categoriesRouter);
    app.use("/api", productsRouter);
    app.use("/api", suppliersRouter);
    app.use("/api", purchasesRouter);
    app.use("/api", clientsRouter);
    app.use("/api", trucksRouter);
    app.use("/api", stockRouter);
    app.use("/api", invoicesRouter);
    app.use("/api", usersRouter);
    app.use("/api", syncRouter);
    app.use("/api", cashRouter);
    app.use("/api", returnsRouter);
    app.use("/api", reportsRouter);

    const rendererPath = path.join(__dirname, "..", "renderer");
    app.use(express.static(rendererPath));

    app.get("*", (_req, res) => {
      const index = path.join(rendererPath, "index.html");
      if (fs.existsSync(index)) {
        res.sendFile(index);
      } else {
        res.status(503).send("<h2>الواجهة غير مبنية بعد — نفّذ: node build-renderer.mjs</h2>");
      }
    });

    app.use((err, _req, res, _next) => {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur interne" });
    });

    const server = app.listen(port, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

module.exports = { initServer };
