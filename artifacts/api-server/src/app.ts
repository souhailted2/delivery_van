import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import session from "express-session";
import createPgSession from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const PgSession = createPgSession(session);

const isProduction = process.env.NODE_ENV === "production";

// SESSION_SECRET hardening: in production it MUST be provided by the host
// environment. Falling back to a constant that lives in a public repo would
// let anyone forge signed session cookies. We refuse to boot rather than
// silently run with a known secret. A throwaway dev fallback is fine locally.
const SESSION_SECRET = process.env.SESSION_SECRET;
if (isProduction && !SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET environment variable is required in production but was not provided.",
  );
}

// CORS allowlist: only these browser origins may make credentialed
// cross-origin requests. Defaults to the production web origin; override with a
// comma-separated CORS_ORIGINS. Server-to-server callers (desktop/mobile sync)
// send no Origin header and are allowed; unknown browser origins are rejected.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "https://deleveri.alllal.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app: Express = express();

// Behind nginx (TLS termination) Express must trust the proxy so that
// req.secure / X-Forwarded-Proto are honoured — required for `secure` session
// cookies to actually be issued, and for correct client IPs.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin(origin, callback) {
    // No Origin header → non-browser / same-origin (curl, server-to-server
    // sync from desktop & mobile). Allowed. Otherwise must be on the allowlist.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// createTableIfMissing is off: connect-pg-simple's table.sql hardcodes the
// "session_pkey"/"IDX_session_expire" constraint/index names, which collide
// with any other app on this DB using the default "session" table name.
// The "user_sessions" table + "user_sessions_pkey"/"IDX_user_sessions_expire"
// are created by migration instead.
app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: false,
    pruneSessionInterval: 60 * 60, // prune expired sessions every hour
  }),
  secret: SESSION_SECRET || "erp-van-sales-dev-only-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Secure (HTTPS-only) in production; requires `trust proxy` above so the
    // cookie is issued behind nginx. Plain HTTP allowed only in local dev.
    secure: isProduction,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

app.use("/api", router);

// Global error handler — last middleware. Catches synchronous throws, errors
// passed via next(err) (e.g. the CORS rejection above), and keeps stack traces
// out of responses in production. Without this, such errors fall through to
// Express's default handler which leaks the stack outside production.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled request error");
  if (res.headersSent) return;
  const status = err.message === "Not allowed by CORS" ? 403 : 500;
  res.status(status).json({
    error: isProduction ? "خطأ في الخادم" : err.message,
  });
});

// Last-resort safety net: an unhandled promise rejection (e.g. a DB failure in
// an async route with no try/catch) must not silently take down the process.
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

export default app;
