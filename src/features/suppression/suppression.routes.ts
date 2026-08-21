import { Router } from "express";
import { suppressionController } from "../../container";

export function suppressionRoutes() {
  const router = Router();
  router.get("/check", suppressionController.check);
  return router;
}
