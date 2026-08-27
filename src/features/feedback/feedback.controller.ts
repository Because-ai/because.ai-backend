import type { Request, Response } from "express";
import { describeError } from "../../lib/errors";
import type { FeedbackInput } from "../../repositories/feedback.repository";
import type { FeedbackService } from "./feedback.service";

const TARGETS = ["finding", "sentence", "cause", "action"];
const VERDICTS = ["accept", "reject", "correct"];

export class FeedbackController {
  constructor(private feedbackService: FeedbackService) {}

  create = async (req: Request, res: Response) => {
    const body = req.body as Partial<FeedbackInput>;

    if (!body.findingId || !body.metric || !body.segment || !body.target || !body.verdict) {
      res.status(400).json({ error: "findingId, metric, segment, target and verdict are required" });
      return;
    }
    if (!TARGETS.includes(body.target) || !VERDICTS.includes(body.verdict)) {
      res.status(400).json({ error: "invalid target or verdict" });
      return;
    }

    try {
      await this.feedbackService.record(body as FeedbackInput);
      const learned = await this.feedbackService.adjustmentsFor(body.metric, body.segment);
      res.json({ ok: true, learned });
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };

  listByFinding = async (req: Request, res: Response) => {
    try {
      res.json({ feedback: await this.feedbackService.listByFinding(req.query.findingId as string) });
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };

  learned = async (_req: Request, res: Response) => {
    try {
      res.json({ adjustments: await this.feedbackService.listLearned() });
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };
}
