import type { Request, Response } from "express";
import type { SuppressionService } from "./suppression.service";

export class SuppressionController {
  constructor(private suppressionService: SuppressionService) {}

  check = async (req: Request, res: Response) => {
    const segment = req.query.segment as string | undefined;
    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;

    if (!segment || !start || !end) {
      res.status(400).json({ error: "segment, start, end query params are required" });
      return;
    }

    try {
      const result = await this.suppressionService.check(segment, start, end);
      res.json({ suppressed: result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "unknown error" });
    }
  };
}
