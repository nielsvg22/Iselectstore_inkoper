import type { AppConfig } from "../config/schema";

export interface AiRequest {
  system: string;
  user: string;
  imageUrls?: string[];
  maxTokens: number;
}
export interface AiResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
export interface AiProvider {
  id: string;
  complete(req: AiRequest): Promise<AiResponse>;
}

type FetchLike = typeof fetch;

export function createProvider(cfg: AppConfig, apiKey: string | null, fetchImpl: FetchLike = fetch): AiProvider | null {
  const p = cfg.ai.provider;
  if (p === "none" || !apiKey) return null;
  if (p === "anthropic") {
    const model = cfg.ai.model || "claude-haiku-5-5";
    return {
      id: `anthropic:${model}`,
      async complete(req) {
        const content: unknown[] = [];
        for (const url of req.imageUrls ?? []) content.push({ type: "image", source: { type: "url", url } });
        content.push({ type: "text", text: req.user });
        const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: "user", content }] }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
        const j = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
        return { text: (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join(""), inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 };
      },
    };
  }
  const base = p === "openai" ? "https://api.openai.com" : cfg.ai.baseUrl.replace(/\/+$/, "");
  if (!base) return null;
  const model = cfg.ai.model || "gpt-4o-mini";
  return {
    id: `${p}:${model}`,
    async complete(req) {
      const userContent: unknown[] = [{ type: "text", text: req.user }];
      for (const url of req.imageUrls ?? []) userContent.push({ type: "image_url", image_url: { url } });
      const res = await fetchImpl(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`AI API ${res.status}`);
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      return { text: j.choices?.[0]?.message?.content ?? "", inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 };
    },
  };
}
