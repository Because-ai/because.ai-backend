import { Router } from "express";
import { findingsController } from "../../container";

export function findingsRoutes() {
  const router = Router();
  router.post("/run", findingsController.run);
  return router;
}
