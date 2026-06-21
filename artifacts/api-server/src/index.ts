import app from "./app";
import { logger } from "./lib/logger";
import { ensureRuntimeSchema } from "./lib/ensureSchema";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function startListening(): void {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

// Ensure additive runtime tables (e.g. client_payments) exist BEFORE serving, so
// the sync routes can never 500 on a missing table. Never block boot on a DDL
// hiccup — log and listen anyway so the health check still passes.
ensureRuntimeSchema()
  .then(() => logger.info("runtime schema ensured"))
  .catch((err) => logger.error({ err }, "ensureRuntimeSchema failed (continuing)"))
  .finally(startListening);
