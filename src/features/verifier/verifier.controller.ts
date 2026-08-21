import type { Request, Response } from "express";
import type { EvidenceMap, NarrativeSentence } from "../../lib/contract";
import type { VerifierService } from "./verifier.service";

export class VerifierController {
  constructor(private verifierService: VerifierService) {}

  verify = async (req: Request, res: Response) => {
    const { narrative, evidence } = req.body as { narrative: NarrativeSentence[]; evidence: EvidenceMap };

    try {
      const result = await this.verifierService.verify(narrative, evidence);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "unknown error" });
    }
  };
}
