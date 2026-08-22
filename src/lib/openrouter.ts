import OpenAI from "openai";
import { toJSONSchema, type z } from "zod";
import { env } from "../config/env";

export interface StructuredCompletionRequest {
  system: string;
  user: string;
  schemaName: string;
}

export class OpenRouterClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }

  async completeStructured<Schema extends z.ZodType>(
    request: StructuredCompletionRequest,
    schema: Schema
  ): Promise<z.infer<Schema>> {
    const jsonSchema = toJSONSchema(schema, { target: "draft-7" });
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.chat.completions.create({
        model: env.OPENROUTER_MODEL,
        max_tokens: 4096,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: jsonSchema,
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        lastError = new Error("OpenRouter returned an empty response");
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch (err) {
        lastError = new Error(
          `OpenRouter response was not valid JSON, likely truncated (finish_reason: ${response.choices[0]?.finish_reason}): ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }

      const parsed = schema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
      lastError = parsed.error;
    }

    throw new Error(`OpenRouter response for "${request.schemaName}" did not match the expected schema: ${String(lastError)}`);
  }
}
