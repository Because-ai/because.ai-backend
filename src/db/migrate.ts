import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "./client";

const migrationsDir = path.join(import.meta.dir, "migrations");

async function run() {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const contents = await readFile(path.join(migrationsDir, file), "utf-8");
    console.log(`applying ${file}`);
    await sql.unsafe(contents);
  }

  console.log("migrations complete");
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
