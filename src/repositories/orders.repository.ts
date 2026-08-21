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

  async monthlySeries(config: MetricConfig, segmentValue: string, months: number, asOfMonth?: string): Promise<MonthlyPoint[]> {
    const params: (string | number)[] = [segmentValue, months];
    let asOfClause = "";
    if (asOfMonth) {
      params.push(`${asOfMonth}-01`);
      asOfClause = `and date_trunc('month', ${config.dateColumn}) <= $3::date`;
    }

    const rows = await this.sql.unsafe<{ month: string; total: string }[]>(
      `
      select to_char(date_trunc('month', ${config.dateColumn}), 'YYYY-MM') as month,
             sum(${config.valueColumn}) as total
      from ${config.table}
      where ${config.segmentColumn} = $1
        ${asOfClause}
      group by 1
      order by 1 desc
      limit $2
      `,
      params
    );

    return rows.map((row) => ({ month: row.month, total: Number(row.total) })).reverse();
  }

  async categoryBreakdown(
    segmentValue: string,
    currentStart: string,
    currentEnd: string,
    priorStart: string,
    priorEnd: string
  ): Promise<CategoryBreakdownRow[]> {
    const rows = await this.sql<{ category: string; current_total: string; prior_total: string }[]>`
      select
        category,
        coalesce(sum(sales) filter (where order_date >= ${currentStart} and order_date < ${currentEnd}), 0) as current_total,
        coalesce(sum(sales) filter (where order_date >= ${priorStart} and order_date < ${priorEnd}), 0) as prior_total
      from orders
      where region = ${segmentValue}
        and order_date >= ${priorStart}
        and order_date < ${currentEnd}
      group by category
    `;

    return rows.map((row) => ({
      category: row.category,
      currentTotal: Number(row.current_total),
      priorTotal: Number(row.prior_total),
    }));
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
    segmentValue: string,
    currentStart: string,
    currentEnd: string,
    priorStart: string,
    priorEnd: string,
    limit: number
  ): Promise<MovingCustomerRow[]> {
    const rows = await this.sql<{ customer_id: string; customer_name: string; delta: string }[]>`
      select
        customer_id,
        max(customer_name) as customer_name,
        coalesce(sum(sales) filter (where order_date >= ${currentStart} and order_date < ${currentEnd}), 0)
          - coalesce(sum(sales) filter (where order_date >= ${priorStart} and order_date < ${priorEnd}), 0) as delta
      from orders
      where region = ${segmentValue}
        and order_date >= ${priorStart}
        and order_date < ${currentEnd}
      group by customer_id
      order by delta asc
      limit ${limit}
    `;

    return rows.map((row) => ({
      customerId: row.customer_id,
      customerName: row.customer_name,
      delta: Number(row.delta),
    }));
  }
}
