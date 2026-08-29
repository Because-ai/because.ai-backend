export interface TokenUsage {
  prompt: number;
  completion: number;
}

interface ChatPrice {
  inUsdPerMTok: number;
  outUsdPerMTok: number;
}

interface EmbedPrice {
  usdPerMTok: number;
}

export const CHAT_PRICES: Record<string, ChatPrice> = {
  "qwen2.5:7b-instruct": { inUsdPerMTok: 0, outUsdPerMTok: 0 },
};

export const EMBED_PRICES: Record<string, EmbedPrice> = {
  "mixedbread-ai/mxbai-embed-large-v1": { usdPerMTok: 0 },
};

const DEFAULT_CHAT_PRICE: ChatPrice = { inUsdPerMTok: 0, outUsdPerMTok: 0 };
const DEFAULT_EMBED_PRICE: EmbedPrice = { usdPerMTok: 0 };

export function chatCostUsd(model: string, usage: TokenUsage): number {
  const price = CHAT_PRICES[model] ?? DEFAULT_CHAT_PRICE;
  return (usage.prompt / 1_000_000) * price.inUsdPerMTok + (usage.completion / 1_000_000) * price.outUsdPerMTok;
}

export function embedCostUsd(model: string, tokens: number): number {
  const price = EMBED_PRICES[model] ?? DEFAULT_EMBED_PRICE;
  return (tokens / 1_000_000) * price.usdPerMTok;
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return { prompt: a.prompt + b.prompt, completion: a.completion + b.completion };
}

export const ZERO_USAGE: TokenUsage = { prompt: 0, completion: 0 };
