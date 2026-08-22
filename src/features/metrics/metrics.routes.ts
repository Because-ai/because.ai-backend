import { Router } from "express";
import { metricsController } from "../../container";

export function metricsRoutes() {
  const router = Router();
  router.get("/", metricsController.list);
  return router;
}
