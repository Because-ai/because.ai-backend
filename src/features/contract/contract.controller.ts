import type { Request, Response } from "express";
import { describeError } from "../../lib/errors";
import type { ContractService } from "./contract.service";

export class ContractController {
  constructor(private contractService: ContractService) {}

  list = async (_req: Request, res: Response) => {
    try {
      res.json({ contracts: this.contractService.list() });
    } catch (err) {
      res.status(500).json({ error: describeError(err) });
    }
  };

  get = async (req: Request, res: Response) => {
    try {
      res.json(this.contractService.get(req.params.metric as string));
    } catch (err) {
      res.status(404).json({ error: describeError(err) });
    }
  };
}
