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
  "google/gemini-2.5-flash-lite": { inUsdPerMTok: 0.1, outUsdPerMTok: 0.4 },
};

export const EMBED_PRICES: Record<string, EmbedPrice> = {
  "voyage-4-lite": { usdPerMTok: 0.02 },
};

const DEFAULT_CHAT_PRICE: ChatPrice = { inUsdPerMTok: 0.15, outUsdPerMTok: 0.6 };
const DEFAULT_EMBED_PRICE: EmbedPrice = { usdPerMTok: 0.02 };

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
