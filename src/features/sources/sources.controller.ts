import type { Request, Response } from "express";
import type { SourcesService } from "./sources.service";

export class SourcesController {
  constructor(private sourcesService: SourcesService) {}

  list = async (_req: Request, res: Response) => {
    try {
      res.json({ sources: await this.sourcesService.list() });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "unknown error" });
    }
  };
}
