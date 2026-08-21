export interface MetricConfig {
  key: string;
  label: string;
  table: string;
  valueColumn: string;
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
    dateColumn: "order_date",
    segmentColumn: "region",
    goodDirection: "up",
    unit: "$ sales",
  },
};

export function getMetricConfig(key: string): MetricConfig {
  const config = metrics[key];
  if (!config) {
    throw new Error(`Unknown metric "${key}"`);
  }
  return config;
}
