import { sql } from "../src/db/client";

async function run() {
  const years = await sql<{ year: number }[]>`
    select distinct extract(year from order_date)::int as year
    from orders
    order by 1
  `;

  for (const { year } of years) {
    await sql`
      insert into calendar_events (id, label, region, starts_on, ends_on, kind)
      values (${`black-friday-${year}`}, ${"Black Friday / Cyber Monday"}, null, ${`${year}-11-20`}, ${`${year}-12-02`}, 'promo')
      on conflict (id) do nothing
    `;
  }

  console.log(`seeded calendar events for ${years.length} years`);
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
