import type { Request, Response } from "express";
import { describeError } from "../../lib/errors";
import type { RetrievalService } from "./retrieval.service";

export class RetrievalController {
  constructor(private retrievalService: RetrievalService) {}

  run = async (req: Request, res: Response) => {
    const query = req.query.query as string | undefined;
    const entityRefs = (req.query.entityRefs as string | undefined)?.split(",").filter(Boolean) ?? [];

    if (!query) {
      res.status(400).json({ error: "query param is required" });
      return;
    }

    try {
      const evidence = await this.retrievalService.run(query, entityRefs);
      res.json({ evidence });
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };
}
