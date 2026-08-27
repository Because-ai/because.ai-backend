import type { Request, Response } from "express";
import { describeError } from "../../lib/errors";
import { assertInScope, getRole } from "../../config/roles";
import type { FindingsService } from "./findings.service";

export class FindingsController {
  constructor(private findingsService: FindingsService) {}

  run = async (req: Request, res: Response) => {
    const metric = (req.query.metric as string | undefined) ?? "sales";
    const segment = (req.query.segment as string | undefined) ?? "West";
    const asOf = req.query.asOf as string | undefined;
    const role = getRole(req.query.role as string | undefined);

    try {
      assertInScope(role, metric, segment);
    } catch (err) {
      res.status(403).json({ error: describeError(err) });
      return;
    }

    try {
      const result = await this.findingsService.run(metric, segment, asOf, { seePii: role.seePii });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };

  latest = async (req: Request, res: Response) => {
    const metric = (req.query.metric as string | undefined) ?? "sales";
    const segment = (req.query.segment as string | undefined) ?? "West";
    const role = getRole(req.query.role as string | undefined);

    try {
      assertInScope(role, metric, segment);
    } catch (err) {
      res.status(403).json({ error: describeError(err) });
      return;
    }

    try {
      const result = await this.findingsService.getLatest(metric, segment, role.seePii);
      if (!result) {
        res.status(404).json({ error: "no cached findings yet, run the pipeline first" });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };
}
