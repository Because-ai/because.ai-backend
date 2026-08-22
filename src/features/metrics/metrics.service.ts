import { metrics, type MetricConfig } from "../../config/metrics";

export interface MetricDefinition extends MetricConfig {
  definitionSql: string;
}

export class MetricsService {
  list(): MetricDefinition[] {
    return Object.values(metrics).map((config) => ({
      ...config,
      definitionSql: `${config.aggregate}(${config.valueColumn}) from ${config.table} grouped by ${config.segmentColumn}, month(${config.dateColumn})`,
    }));
  }
}
