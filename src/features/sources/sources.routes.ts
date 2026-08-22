import { Router } from "express";
import { sourcesController } from "../../container";

export function sourcesRoutes() {
  const router = Router();
  router.get("/", sourcesController.list);
  return router;
}
