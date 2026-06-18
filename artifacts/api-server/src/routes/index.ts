import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import branchesRouter from "./branches";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import suppliersRouter from "./suppliers";
import purchasesRouter from "./purchases";
import clientsRouter from "./clients";
import trucksRouter from "./trucks";
import stockRouter from "./stock";
import invoicesRouter from "./invoices";
import returnsRouter from "./returns";
import cashRouter from "./cash";
import reportsRouter from "./reports";
import storageRouter from "./storage";
import settingsRouter from "./settings";
import syncV2Router from "./sync-v2";
import dispatchesRouter from "./dispatches";
import { requireAuth } from "../lib/authMiddleware";

const router: IRouter = Router();

// ── PUBLIC routes (no session required) ──────────────────────────────────────
// Health check (deploy probe) and the auth endpoints themselves. `/auth/me`
// returns 401 on its own when there is no session.
router.use(healthRouter);
router.use(authRouter);

// ── GLOBAL AUTH GATE ─────────────────────────────────────────────────────────
// Everything mounted below requires an authenticated session (user OR truck).
// This is the single enforcement point that closes the previous gap where most
// data/mutation routes were reachable with no session at all. Routers that need
// finer rules (truck-vs-user, admin-only) still apply their own checks on top.
router.use(requireAuth);

router.use(storageRouter);
router.use(usersRouter);
router.use(branchesRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(suppliersRouter);
router.use(purchasesRouter);
router.use(clientsRouter);
router.use(trucksRouter);
router.use(stockRouter);
router.use(invoicesRouter);
router.use(returnsRouter);
router.use(cashRouter);
router.use(reportsRouter);
router.use(settingsRouter);
router.use(syncV2Router);
router.use(dispatchesRouter);

export default router;
