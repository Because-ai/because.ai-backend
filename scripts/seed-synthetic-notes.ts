import { randomUUID } from "node:crypto";
import { sql } from "../src/db/client";
import { VoyageClient } from "../src/lib/voyage";

const voyage = new VoyageClient();

const NOTE_TEMPLATES: Array<(name: string) => string> = [
  (name) =>
    `Call with the buyer at ${name}. They like the product but pushed hard on price this cycle, mentioned a competitor quote came in noticeably lower on the same order size. Offered our standard volume discount, they said they'd think about it.`,
  (name) =>
    `${name} put their reorder on hold this month. Procurement is reviewing every vendor above a spend threshold before approving new POs. No firm no, but nothing signed either.`,
  (name) =>
    `Support ticket from ${name}: order arrived later than the quoted ship date, they said it's affecting whether they reorder from us versus a local supplier.`,
  (name) => `Note from account rep: ${name} mentioned budget cuts on their end this quarter, holding off on non-essential purchases including ours.`,
  (name) => `${name} reordered as usual this cycle, no concerns raised. Steady account.`,
];

const TYPES: Array<"note" | "ticket" | "call"> = ["note", "ticket", "call"];

async function run() {
  const customers = await sql<{ customer_id: string; customer_name: string }[]>`
    select customer_id, max(customer_name) as customer_name
    from orders
    where region = 'West'
    group by customer_id
    order by count(*) desc
    limit 20
  `;

  console.log(`seeding notes for ${customers.length} West-region customers`);

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i]!;
    const template = NOTE_TEMPLATES[i % NOTE_TEMPLATES.length]!;
    const excerpt = template(customer.customer_name);
    const type = TYPES[i % TYPES.length]!;
    const id = `note-${customer.customer_id}-${randomUUID().slice(0, 8)}`;

    const [embedding] = await voyage.embed([excerpt], "document");
    const vectorLiteral = `[${embedding!.join(",")}]`;

    await sql`
      insert into notes (id, type, source_id, entity_type, entity_ref, excerpt, meta, embedding)
      values (
        ${id},
        ${type},
        ${`CRM-${1000 + i}`},
        'customer',
        ${customer.customer_id},
        ${excerpt},
        ${sql.json({ account: customer.customer_name, logged: new Date().toISOString().slice(0, 10) })},
        ${vectorLiteral}::vector
      )
      on conflict (id) do nothing
    `;
  }

  console.log("done");
  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
