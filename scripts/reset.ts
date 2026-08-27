import { sql } from "../src/db/client";

async function run() {
  await sql`truncate table cached_findings`;
  await sql`truncate table notes`;
  await sql`truncate table calendar_events`;
  await sql`delete from orders where region = 'Online'`;
  try {
    await sql`truncate table feedback`;
    await sql`truncate table learned_adjustments`;
    await sql`truncate table marketing_spend`;
  } catch {
    console.log("some tables not present yet, run migrate first");
  }
  console.log("reset: cleared findings, notes, calendar, feedback, and Online seed rows");
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
