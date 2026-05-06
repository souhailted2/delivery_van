import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(authRouter);
router.use(usersRouter);
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

export default router;
