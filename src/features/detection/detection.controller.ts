import type { Request, Response } from "express";
import { getMetricConfig } from "../../config/metrics";
import type { DetectionService } from "./detection.service";

export class DetectionController {
  constructor(private detectionService: DetectionService) {}

  run = async (req: Request, res: Response) => {
    const metricKey = (req.query.metric as string | undefined) ?? "sales";
    const segment = (req.query.segment as string | undefined) ?? "West";

    try {
      const metric = getMetricConfig(metricKey);
      const result = await this.detectionService.run(metric, segment);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "unknown error" });
    }
  };
}
