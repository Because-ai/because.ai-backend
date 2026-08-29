import OpenAI from "openai";
import { toJSONSchema, type z } from "zod";
import { env } from "../config/env";
import { ZERO_USAGE, type TokenUsage } from "./pricing";

const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

const MAX_COMPLETION_TOKENS = 1536;

export interface StructuredCompletionRequest {
  system: string;
  user: string;
  schemaName: string;
}

export interface StructuredCompletionResult<T> {
  value: T;
  usage: TokenUsage;
  model: string;
}

export class LlmClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: "ollama",
      baseURL: env.OLLAMA_BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    });
  }

  get model(): string {
    return env.OLLAMA_MODEL;
  }

  async completeStructured<Schema extends z.ZodType>(
    request: StructuredCompletionRequest,
    schema: Schema
  ): Promise<StructuredCompletionResult<z.infer<Schema>>> {
    const jsonSchema = toJSONSchema(schema, { target: "draft-7" });
    let lastError: unknown;
    let accumulated: TokenUsage = { ...ZERO_USAGE };

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.chat.completions.create({
        model: env.OLLAMA_MODEL,
        max_tokens: MAX_COMPLETION_TOKENS,
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

      accumulated = {
        prompt: accumulated.prompt + (response.usage?.prompt_tokens ?? 0),
        completion: accumulated.completion + (response.usage?.completion_tokens ?? 0),
      };

      const content = response.choices[0]?.message?.content;
      if (!content) {
        lastError = new Error(`${env.OLLAMA_MODEL} returned an empty response`);
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch (err) {
        lastError = new Error(
          `${env.OLLAMA_MODEL} response was not valid JSON, likely truncated (finish_reason: ${response.choices[0]?.finish_reason}): ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }

      const parsed = schema.safeParse(raw);
      if (parsed.success) {
        return { value: parsed.data, usage: accumulated, model: env.OLLAMA_MODEL };
      }
      lastError = parsed.error;
    }

    throw new Error(`${env.OLLAMA_MODEL} response for "${request.schemaName}" did not match the expected schema: ${String(lastError)}`);
  }
}
