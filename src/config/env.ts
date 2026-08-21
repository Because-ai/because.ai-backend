import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Postgres connection string, e.g. from Neon)"),
  OPENROUTER_API_KEY: z.string().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().min(1, "OPENROUTER_MODEL is required, e.g. google/gemini-2.5-flash-lite"),
  VOYAGE_API_KEY: z.string().min(1, "VOYAGE_API_KEY is required"),
  PORT: z.string().default("4000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the values.`);
}

export const env = {
  ...parsed.data,
  PORT: Number(parsed.data.PORT),
};
