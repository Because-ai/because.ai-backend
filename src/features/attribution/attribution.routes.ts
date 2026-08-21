import { Router } from "express";
import { attributionController } from "../../container";

export function attributionRoutes() {
  const router = Router();
  router.get("/run", attributionController.run);
  return router;
}
