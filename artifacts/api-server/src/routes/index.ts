import { Router, type IRouter } from "express";
import healthRouter from "./health";
import netpremiumRouter from "./netpremium";

const router: IRouter = Router();

router.use(healthRouter);
router.use(netpremiumRouter);

export default router;
