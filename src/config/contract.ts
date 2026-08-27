import { metrics, type MetricConfig } from "./metrics";

export interface SourceLineage {
  system: string;
  table: string;
  column: string;
  transform: string;
}

export interface DriverDef {
  key: string;
  label: string;
  method: string;
}

export interface MaterialityThresholds {
  sigma: number;
  minAbsImpact: number;
  minSharePct: number;
}

export interface AccessRule {
  roles: string[];
  piiColumns: string[];
}

export interface KpiContract {
  key: string;
  definition: string;
  formula: string;
  grain: "month";
  refreshCadence: string;
  lastRefreshed: string;
  owner: string;
  drivers: DriverDef[];
  materiality: MaterialityThresholds;
  access: AccessRule;
  lineage: SourceLineage[];
}

export const WAREHOUSE_LAST_REFRESHED = "2017-12-31";

const sharedDrivers: DriverDef[] = [
  { key: "c-category", label: "Category mix", method: "SQL contribution analysis" },
  { key: "c-discount", label: "Discount rate", method: "SQL average-rate shift" },
  { key: "c-account", label: "Account movement", method: "SQL per-customer delta" },
  { key: "c-marketing", label: "Marketing spend", method: "External join, daily to monthly" },
];

export const contracts: Record<string, KpiContract> = {
  sales: {
    key: "sales",
    definition: "Gross booked revenue for the region in the calendar month, before returns.",
    formula: "sum(orders.sales) grouped by region, month(order_date)",
    grain: "month",
    refreshCadence: "daily 02:00 UTC",
    lastRefreshed: WAREHOUSE_LAST_REFRESHED,
    owner: "VP Revenue Operations",
    drivers: sharedDrivers,
    materiality: { sigma: 1.5, minAbsImpact: 6000, minSharePct: 10 },
    access: { roles: ["cfo", "west_sales_lead", "ops_viewer"], piiColumns: ["customer_name"] },
    lineage: [
      { system: "Snowflake (prod) / Postgres (proto)", table: "orders", column: "sales", transform: "sum over calendar month, filtered by region" },
    ],
  },
  profit: {
    key: "profit",
    definition: "Contribution profit for the region in the calendar month: revenue less product and fulfilment cost.",
    formula: "sum(orders.profit) grouped by region, month(order_date)",
    grain: "month",
    refreshCadence: "daily 02:00 UTC",
    lastRefreshed: WAREHOUSE_LAST_REFRESHED,
    owner: "Finance Business Partner",
    drivers: sharedDrivers,
    materiality: { sigma: 1.5, minAbsImpact: 1500, minSharePct: 10 },
    access: { roles: ["cfo", "west_sales_lead"], piiColumns: ["customer_name"] },
    lineage: [
      { system: "Snowflake (prod) / Postgres (proto)", table: "orders", column: "profit", transform: "sum over calendar month, filtered by region" },
    ],
  },
  quantity: {
    key: "quantity",
    definition: "Total units shipped for the region in the calendar month.",
    formula: "sum(orders.quantity) grouped by region, month(order_date)",
    grain: "month",
    refreshCadence: "daily 02:00 UTC",
    lastRefreshed: WAREHOUSE_LAST_REFRESHED,
    owner: "Supply Planning Lead",
    drivers: sharedDrivers,
    materiality: { sigma: 1.5, minAbsImpact: 80, minSharePct: 10 },
    access: { roles: ["cfo", "west_sales_lead", "ops_viewer"], piiColumns: ["customer_name"] },
    lineage: [
      { system: "Snowflake (prod) / Postgres (proto)", table: "orders", column: "quantity", transform: "sum over calendar month, filtered by region" },
    ],
  },
  discount: {
    key: "discount",
    definition: "Order-weighted average discount rate applied in the region in the calendar month.",
    formula: "avg(orders.discount) grouped by region, month(order_date)",
    grain: "month",
    refreshCadence: "daily 02:00 UTC",
    lastRefreshed: WAREHOUSE_LAST_REFRESHED,
    owner: "Pricing Manager",
    drivers: [sharedDrivers[0]!, sharedDrivers[2]!],
    materiality: { sigma: 1.5, minAbsImpact: 0.01, minSharePct: 8 },
    access: { roles: ["cfo", "west_sales_lead"], piiColumns: ["customer_name"] },
    lineage: [
      { system: "Snowflake (prod) / Postgres (proto)", table: "orders", column: "discount", transform: "average over calendar month, filtered by region" },
    ],
  },
};

export interface KpiContractView extends KpiContract, Pick<MetricConfig, "label" | "unit" | "goodDirection" | "aggregate"> {}

export function getContract(key: string): KpiContract {
  const contract = contracts[key];
  if (!contract) {
    throw new Error(`No contract for metric "${key}"`);
  }
  return contract;
}

export function listContracts(): KpiContractView[] {
  return Object.values(contracts).map((contract) => {
    const metric = metrics[contract.key]!;
    return {
      ...contract,
      label: metric.label,
      unit: metric.unit,
      goodDirection: metric.goodDirection,
      aggregate: metric.aggregate,
    };
  });
}
