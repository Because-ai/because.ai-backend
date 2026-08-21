import { Router } from "express";
import { retrievalController } from "../../container";

export function retrievalRoutes() {
  const router = Router();
  router.get("/run", retrievalController.run);
  return router;
}
