import type { Request, Response } from "express";
import { describeError } from "../../lib/errors";
import type { NarrativeInput, NarrativeService } from "./narrative.service";

export class NarrativeController {
  constructor(private narrativeService: NarrativeService) {}

  generate = async (req: Request, res: Response) => {
    try {
      const result = await this.narrativeService.generate(req.body as NarrativeInput);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };
}
