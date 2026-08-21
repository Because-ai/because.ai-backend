import { Router } from "express";
import { narrativeController } from "../../container";

export function narrativeRoutes() {
  const router = Router();
  router.post("/generate", narrativeController.generate);
  return router;
}
