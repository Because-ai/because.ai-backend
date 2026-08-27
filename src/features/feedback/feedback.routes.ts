import { Router } from "express";
import { feedbackController } from "../../container";

export function feedbackRoutes() {
  const router = Router();
  router.post("/", feedbackController.create);
  router.get("/learned", feedbackController.learned);
  router.get("/", feedbackController.listByFinding);
  return router;
}
