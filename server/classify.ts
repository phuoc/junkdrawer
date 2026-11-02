import Anthropic from "@anthropic-ai/sdk";
import type { Sorter, Sorting } from "../shared/types.ts";
import { classifyByRules, cleanSorting, SORTING_INSTRUCTIONS, SORTING_SCHEMA, sortingRequest } from "../shared/sorting.ts";

export interface Classifier {
  mode: Sorter;
  classify(text: string, existingCategories?: string[]): Promise<Sorting & { sortedBy: Sorter }>;
}

// The rules, prompt and response cleanup live in shared/sorting.ts so the
// claude.ai preview sorts entries the same way.
export { classifyByRules, forcedKind } from "../shared/sorting.ts";

export function createClassifier({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.JUNK_MODEL || "claude-haiku-4-5",
}: { apiKey?: string; model?: string } = {}): Classifier {
  if (!apiKey) return { mode: "rules", classify: async (text) => ({ ...classifyByRules(text), sortedBy: "rules" }) };

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });

  async function classify(text: string, existingCategories: string[] = []) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 1000,
        output_config: { format: { type: "json_schema", schema: SORTING_SCHEMA } },
        system: SORTING_INSTRUCTIONS,
        messages: [
          {
            role: "user",
            content: sortingRequest(text, existingCategories),
          },
        ],
      });
      if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`stop_reason ${res.stop_reason}`);
      const out = res.content.find((b) => b.type === "text");
      if (!out) throw new Error("no text in response");
      return { ...cleanSorting(JSON.parse(out.text) as Partial<Sorting>, text), sortedBy: "ai" } as const;
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) console.error("[classify] invalid ANTHROPIC_API_KEY");
      else if (err instanceof Anthropic.RateLimitError) console.error("[classify] rate limited");
      else if (err instanceof Anthropic.APIError) console.error(`[classify] API error ${err.status}: ${err.message}`);
      else console.error("[classify]", (err as Error).message);
      return { ...classifyByRules(text), sortedBy: "rules" } as const;
    }
  }

  return { mode: "ai", classify };
}
