import { sql } from "../src/db/client";

const REGION = "Online";
const START_ROW_ID = 200001;
const CATEGORIES: Array<[string, string]> = [
  ["Technology", "Phones"],
  ["Office Supplies", "Binders"],
  ["Furniture", "Chairs"],
];

interface SeedRow {
  row_id: number;
  order_id: string;
  order_date: string;
  ship_date: string;
  ship_mode: string;
  customer_id: string;
  customer_name: string;
  segment: string;
  country: string;
  city: string;
  state: string;
  postal_code: string | null;
  region: string;
  product_id: string;
  category: string;
  sub_category: string;
  product_name: string;
  sales: number;
  quantity: number;
  discount: number;
  profit: number;
}

function buildMonth(monthIso: string, startId: number, count: number): SeedRow[] {
  const rows: SeedRow[] = [];
  for (let i = 0; i < count; i++) {
    const [category, subCategory] = CATEGORIES[i % CATEGORIES.length]!;
    const day = String((i % 26) + 1).padStart(2, "0");
    const sales = 180 + ((i * 37) % 400);
    rows.push({
      row_id: startId + i,
      order_id: `ON-${monthIso}-${i}`,
      order_date: `${monthIso}-${day}`,
      ship_date: `${monthIso}-${day}`,
      ship_mode: "Standard Class",
      customer_id: `ON-${String((i % 10) + 1).padStart(4, "0")}`,
      customer_name: `Online Buyer ${(i % 10) + 1}`,
      segment: "Consumer",
      country: "United States",
      city: "Online",
      state: "Online",
      postal_code: null,
      region: REGION,
      product_id: `ON-PRD-${i % 12}`,
      category,
      sub_category: subCategory,
      product_name: `${subCategory} bundle ${i % 12}`,
      sales,
      quantity: 1 + (i % 4),
      discount: i % 5 === 0 ? 0.1 : 0,
      profit: Math.round(sales * 0.18),
    });
  }
  return rows;
}

async function run() {
  const rows = [...buildMonth("2017-11", START_ROW_ID, 22), ...buildMonth("2017-12", START_ROW_ID + 500, 26)];

  await sql`
    insert into orders ${sql(rows)}
    on conflict (row_id) do nothing
  `;

  console.log(`seeded ${rows.length} rows for the ${REGION} region across 2 months`);
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
