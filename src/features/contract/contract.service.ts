import { listContracts, getContract, type KpiContract, type KpiContractView } from "../../config/contract";

export class ContractService {
  list(): KpiContractView[] {
    return listContracts();
  }

  get(key: string): KpiContract {
    return getContract(key);
  }
}
