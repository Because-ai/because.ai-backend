import type { MetricConfig } from "../config/metrics";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

// A metric's raw value has no meaning without its unit: average discount is stored as a
// fraction, so rounding it to whole numbers renders every month as "0" and makes the
// evidence table contradict the claim it is supposed to support.
export function formatMetricValue(metric: MetricConfig, value: number): string {
  if (metric.valueColumn === "discount") {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (metric.valueColumn === "sales" || metric.valueColumn === "profit") {
    return money.format(value);
  }
  return plain.format(value);
}
