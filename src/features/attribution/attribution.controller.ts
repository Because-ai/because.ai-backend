import type { Request, Response } from "express";
import { describeError } from "../../lib/errors";
import { getMetricConfig } from "../../config/metrics";
import type { AttributionService } from "./attribution.service";

export class AttributionController {
  constructor(private attributionService: AttributionService) {}

  run = async (req: Request, res: Response) => {
    const { segment, currentStart, currentEnd, priorStart, priorEnd, priorValue } = req.query;
    const metricKey = (req.query.metric as string | undefined) ?? "sales";

    if (!segment || !currentStart || !currentEnd || !priorStart || !priorEnd || !priorValue) {
      res.status(400).json({ error: "segment, currentStart, currentEnd, priorStart, priorEnd, priorValue query params are required" });
      return;
    }

    try {
      const result = await this.attributionService.run({
        metric: getMetricConfig(metricKey),
        segmentValue: String(segment),
        priorValue: Number(priorValue),
        currentStart: String(currentStart),
        currentEnd: String(currentEnd),
        priorStart: String(priorStart),
        priorEnd: String(priorEnd),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };
}
