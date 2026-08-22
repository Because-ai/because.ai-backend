import type { Request, Response } from "express";
import { describeError } from "../../lib/errors";
import { getMetricConfig } from "../../config/metrics";
import type { DetectionService } from "./detection.service";

export class DetectionController {
  constructor(private detectionService: DetectionService) {}

  run = async (req: Request, res: Response) => {
    const metricKey = (req.query.metric as string | undefined) ?? "sales";
    const segment = (req.query.segment as string | undefined) ?? "West";
    const asOf = req.query.asOf as string | undefined;

    try {
      const metric = getMetricConfig(metricKey);
      const result = await this.detectionService.run(metric, segment, asOf);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };
}
