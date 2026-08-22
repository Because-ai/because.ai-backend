export interface MetricConfig {
  key: string;
  label: string;
  table: string;
  valueColumn: string;
  aggregate: "sum" | "avg";
  dateColumn: string;
  segmentColumn: string;
  goodDirection: "up" | "down";
  unit: string;
}

export const metrics: Record<string, MetricConfig> = {
  sales: {
    key: "sales",
    label: "Sales",
    table: "orders",
    valueColumn: "sales",
    aggregate: "sum",
    dateColumn: "order_date",
    segmentColumn: "region",
    goodDirection: "up",
    unit: "$ sales",
  },
  profit: {
    key: "profit",
    label: "Profit",
    table: "orders",
    valueColumn: "profit",
    aggregate: "sum",
    dateColumn: "order_date",
    segmentColumn: "region",
    goodDirection: "up",
    unit: "$ profit",
  },
  quantity: {
    key: "quantity",
    label: "Units sold",
    table: "orders",
    valueColumn: "quantity",
    aggregate: "sum",
    dateColumn: "order_date",
    segmentColumn: "region",
    goodDirection: "up",
    unit: "units",
  },
  discount: {
    key: "discount",
    label: "Average discount",
    table: "orders",
    valueColumn: "discount",
    aggregate: "avg",
    dateColumn: "order_date",
    segmentColumn: "region",
    goodDirection: "down",
    unit: "% discount",
  },
};

export const metricKeys = Object.keys(metrics);

export function getMetricConfig(key: string): MetricConfig {
  const config = metrics[key];
  if (!config) {
    throw new Error(`Unknown metric "${key}"`);
  }
  return config;
}
