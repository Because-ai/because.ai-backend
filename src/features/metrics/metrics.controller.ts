import type { Request, Response } from "express";
import { describeError } from "../../lib/errors";
import type { MetricsService } from "./metrics.service";

export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  list = async (_req: Request, res: Response) => {
    try {
      res.json({ metrics: this.metricsService.list() });
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };
}
