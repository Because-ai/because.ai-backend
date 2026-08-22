import type { Sql } from "postgres";
import type { MetricConfig } from "../config/metrics";

export interface MonthlyPoint {
  month: string;
  total: number;
}

export interface CategoryBreakdownRow {
  category: string;
  currentTotal: number;
  priorTotal: number;
  currentCount: number;
  priorCount: number;
}

export interface DiscountStats {
  currentAvgDiscount: number;
  priorAvgDiscount: number;
  currentTotal: number;
  priorTotal: number;
}

export interface MovingCustomerRow {
  customerId: string;
  customerName: string;
  delta: number;
}

export class OrdersRepository {
  constructor(private sql: Sql) {}

  async monthlySeries(config: MetricConfig, segmentValue: string, months: number, asOfMonth?: string): Promise<{ points: MonthlyPoint[]; query: string }> {
    const params: (string | number)[] = [segmentValue, months];
    let asOfClause = "";
    if (asOfMonth) {
      params.push(`${asOfMonth}-01`);
      asOfClause = `and date_trunc('month', ${config.dateColumn}) <= $3::date`;
    }

    const aggregation = `${config.aggregate}(${config.valueColumn})`;

    const query = `select to_char(date_trunc('month', ${config.dateColumn}), 'YYYY-MM') as month,
       ${aggregation} as total
from ${config.table}
where ${config.segmentColumn} = '${segmentValue}'
  ${asOfClause ? `and date_trunc('month', ${config.dateColumn}) <= '${asOfMonth}-01'::date` : ""}
group by 1
order by 1 desc
limit ${months};`;

    const rows = await this.sql.unsafe<{ month: string; total: string }[]>(
      `
      select to_char(date_trunc('month', ${config.dateColumn}), 'YYYY-MM') as month,
             ${aggregation} as total
      from ${config.table}
      where ${config.segmentColumn} = $1
        ${asOfClause}
      group by 1
      order by 1 desc
      limit $2
      `,
      params
    );

    const points = rows.map((row) => ({ month: row.month, total: Number(row.total) })).reverse();
    return { points, query };
  }

  async categoryBreakdown(
    config: MetricConfig,
    segmentValue: string,
    currentStart: string,
    currentEnd: string,
    priorStart: string,
    priorEnd: string
  ): Promise<{ rows: CategoryBreakdownRow[]; query: string }> {
    const agg = `${config.aggregate}(${config.valueColumn})`;

    const query = `select category,
       coalesce(${agg} filter (where order_date >= '${currentStart}' and order_date < '${currentEnd}'), 0) as current_total,
       coalesce(${agg} filter (where order_date >= '${priorStart}' and order_date < '${priorEnd}'), 0) as prior_total,
       count(*) filter (where order_date >= '${currentStart}' and order_date < '${currentEnd}') as current_count,
       count(*) filter (where order_date >= '${priorStart}' and order_date < '${priorEnd}') as prior_count
from orders
where region = '${segmentValue}'
  and order_date >= '${priorStart}'
  and order_date < '${currentEnd}'
group by category;`;

    const rows = await this.sql.unsafe<
      { category: string; current_total: string; prior_total: string; current_count: string; prior_count: string }[]
    >(
      `
      select
        category,
        coalesce(${agg} filter (where order_date >= $2 and order_date < $3), 0) as current_total,
        coalesce(${agg} filter (where order_date >= $4 and order_date < $5), 0) as prior_total,
        count(*) filter (where order_date >= $2 and order_date < $3) as current_count,
        count(*) filter (where order_date >= $4 and order_date < $5) as prior_count
      from orders
      where region = $1
        and order_date >= $4
        and order_date < $3
      group by category
      `,
      [segmentValue, currentStart, currentEnd, priorStart, priorEnd]
    );

    return {
      rows: rows.map((row) => ({
        category: row.category,
        currentTotal: Number(row.current_total),
        priorTotal: Number(row.prior_total),
        currentCount: Number(row.current_count),
        priorCount: Number(row.prior_count),
      })),
      query,
    };
  }

  async discountStats(
    segmentValue: string,
    currentStart: string,
    currentEnd: string,
    priorStart: string,
    priorEnd: string
  ): Promise<DiscountStats> {
    const [row] = await this.sql<{ current_avg: string | null; prior_avg: string | null; current_total: string | null; prior_total: string | null }[]>`
      select
        avg(discount) filter (where order_date >= ${currentStart} and order_date < ${currentEnd}) as current_avg,
        avg(discount) filter (where order_date >= ${priorStart} and order_date < ${priorEnd}) as prior_avg,
        sum(sales) filter (where order_date >= ${currentStart} and order_date < ${currentEnd}) as current_total,
        sum(sales) filter (where order_date >= ${priorStart} and order_date < ${priorEnd}) as prior_total
      from orders
      where region = ${segmentValue}
        and order_date >= ${priorStart}
        and order_date < ${currentEnd}
    `;

    return {
      currentAvgDiscount: Number(row?.current_avg ?? 0),
      priorAvgDiscount: Number(row?.prior_avg ?? 0),
      currentTotal: Number(row?.current_total ?? 0),
      priorTotal: Number(row?.prior_total ?? 0),
    };
  }

  async topMovingCustomers(
    config: MetricConfig,
    segmentValue: string,
    currentStart: string,
    currentEnd: string,
    priorStart: string,
    priorEnd: string,
    limit: number
  ): Promise<MovingCustomerRow[]> {
    const agg = `${config.aggregate}(${config.valueColumn})`;

    const rows = await this.sql.unsafe<{ customer_id: string; customer_name: string; delta: string }[]>(
      `
      select
        customer_id,
        max(customer_name) as customer_name,
        coalesce(${agg} filter (where order_date >= $2 and order_date < $3), 0)
          - coalesce(${agg} filter (where order_date >= $4 and order_date < $5), 0) as delta
      from orders
      where region = $1
        and order_date >= $4
        and order_date < $3
      group by customer_id
      order by delta asc
      limit $6
      `,
      [segmentValue, currentStart, currentEnd, priorStart, priorEnd, limit]
    );

    return rows.map((row) => ({
      customerId: row.customer_id,
      customerName: row.customer_name,
      delta: Number(row.delta),
    }));
  }
}
