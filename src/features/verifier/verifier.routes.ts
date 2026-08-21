import { Router } from "express";
import { verifierController } from "../../container";

export function verifierRoutes() {
  const router = Router();
  router.post("/verify", verifierController.verify);
  return router;
}
