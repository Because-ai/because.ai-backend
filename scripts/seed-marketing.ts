import { sql } from "../src/db/client";

const REGIONS = ["West", "East", "Central", "South"];
const CHANNELS = ["Paid search", "Paid social", "Display"];
const START = new Date(Date.UTC(2016, 0, 1));
const END = new Date(Date.UTC(2017, 11, 31));

const BASE_DAILY: Record<string, number> = { West: 900, East: 750, Central: 500, South: 480 };

function cutFactor(region: string, date: Date): number {
  if (region === "West" && date.getUTCFullYear() === 2017 && date.getUTCMonth() === 8) {
    return 0.45;
  }
  return 1;
}

async function run() {
  const rows: { spend_date: string; region: string; channel: string; spend: number }[] = [];

  for (let day = new Date(START); day <= END; day.setUTCDate(day.getUTCDate() + 1)) {
    const iso = day.toISOString().slice(0, 10);
    for (const region of REGIONS) {
      const base = (BASE_DAILY[region] ?? 500) * cutFactor(region, day);
      const seasonal = 1 + 0.15 * Math.sin((day.getUTCMonth() / 12) * Math.PI * 2);
      CHANNELS.forEach((channel, index) => {
        const share = [0.5, 0.32, 0.18][index]!;
        rows.push({ spend_date: iso, region, channel, spend: Math.round(base * seasonal * share) });
      });
    }
  }

  await sql`truncate table marketing_spend`;
  for (let i = 0; i < rows.length; i += 2000) {
    await sql`insert into marketing_spend ${sql(rows.slice(i, i + 2000))}`;
  }

  console.log(`seeded ${rows.length} daily marketing spend rows`);
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
