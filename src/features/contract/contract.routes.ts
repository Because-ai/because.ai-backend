import { Router } from "express";
import { contractController } from "../../container";

export function contractRoutes() {
  const router = Router();
  router.get("/", contractController.list);
  router.get("/:metric", contractController.get);
  return router;
}
