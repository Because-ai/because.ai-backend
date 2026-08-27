import { randomUUID } from "node:crypto";
import { sql } from "../src/db/client";
import { VoyageClient } from "../src/lib/voyage";

const voyage = new VoyageClient();

const REGIONS = ["West", "East", "Central", "South"];
const CUSTOMERS_PER_REGION = 18;

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

interface PendingNote {
  id: string;
  type: "note" | "ticket" | "call";
  sourceId: string;
  entityRef: string;
  excerpt: string;
  account: string;
}

async function run() {
  const pending: PendingNote[] = [];
  let sourceCounter = 1000;

  for (const region of REGIONS) {
    const customers = await sql<{ customer_id: string; customer_name: string }[]>`
      select customer_id, max(customer_name) as customer_name
      from orders
      where region = ${region}
      group by customer_id
      order by count(*) desc
      limit ${CUSTOMERS_PER_REGION}
    `;

    customers.forEach((customer, index) => {
      const templateIndex = region === "South" ? 4 : index % NOTE_TEMPLATES.length;
      pending.push({
        id: `note-${customer.customer_id}-${randomUUID().slice(0, 8)}`,
        type: TYPES[index % TYPES.length]!,
        sourceId: `CRM-${sourceCounter++}`,
        entityRef: customer.customer_id,
        excerpt: NOTE_TEMPLATES[templateIndex]!(customer.customer_name),
        account: customer.customer_name,
      });
    });
  }

  console.log(`seeding ${pending.length} notes across ${REGIONS.length} regions`);

  const { embeddings } = await voyage.embed(
    pending.map((note) => note.excerpt),
    "document"
  );

  for (let i = 0; i < pending.length; i++) {
    const note = pending[i]!;
    const vectorLiteral = `[${embeddings[i]!.join(",")}]`;

    await sql`
      insert into notes (id, type, source_id, entity_type, entity_ref, excerpt, meta, embedding)
      values (
        ${note.id},
        ${note.type},
        ${note.sourceId},
        'customer',
        ${note.entityRef},
        ${note.excerpt},
        ${sql.json({ account: note.account, logged: new Date().toISOString().slice(0, 10) })},
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
