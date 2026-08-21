import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { sql } from "../src/db/client";

const CSV_PATH = path.join(import.meta.dir, "..", "data", "superstore.csv");
const BATCH_SIZE = 500;

function toIsoDate(value: string): string {
  const [month, day, year] = value.split("/");
  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

async function run() {
  const raw = await readFile(CSV_PATH, "utf-8");
  const records: Record<string, string>[] = parse(raw, { columns: true, skip_empty_lines: true });

  console.log(`loaded ${records.length} rows from CSV, inserting...`);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE).map((row) => ({
      row_id: Number(row["Row ID"]),
      order_id: row["Order ID"],
      order_date: toIsoDate(row["Order Date"]!),
      ship_date: toIsoDate(row["Ship Date"]!),
      ship_mode: row["Ship Mode"],
      customer_id: row["Customer ID"],
      customer_name: row["Customer Name"],
      segment: row["Segment"],
      country: row["Country"],
      city: row["City"],
      state: row["State"],
      postal_code: row["Postal Code"] || null,
      region: row["Region"],
      product_id: row["Product ID"],
      category: row["Category"],
      sub_category: row["Sub-Category"],
      product_name: row["Product Name"],
      sales: Number(row["Sales"]),
      quantity: Number(row["Quantity"]),
      discount: Number(row["Discount"]),
      profit: Number(row["Profit"]),
    }));

    await sql`
      insert into orders ${sql(batch)}
      on conflict (row_id) do nothing
    `;

    console.log(`inserted ${Math.min(i + BATCH_SIZE, records.length)} / ${records.length}`);
  }

  console.log("done");
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
