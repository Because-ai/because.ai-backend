import { Router } from "express";
import { detectionController } from "../../container";

export function detectionRoutes() {
  const router = Router();
  router.get("/run", detectionController.run);
  return router;
}
