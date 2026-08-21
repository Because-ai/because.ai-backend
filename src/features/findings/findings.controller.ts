import type { Request, Response } from "express";
import type { FindingsService } from "./findings.service";

export class FindingsController {
  constructor(private findingsService: FindingsService) {}

  run = async (req: Request, res: Response) => {
    const metric = (req.query.metric as string | undefined) ?? "sales";
    const segment = (req.query.segment as string | undefined) ?? "West";

    try {
      const result = await this.findingsService.run(metric, segment);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "unknown error" });
    }
  };
}
