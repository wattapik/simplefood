#!/usr/bin/env node
/**
 * One-shot bridge: connects to cronometer-api-mcp as an MCP client and runs a
 * single diary action, printing the result as JSON on stdout.
 *
 * This exists so the Laravel backend can show ("fetch") and edit ("remove",
 * "update") a basic "what have I eaten today" diary without reimplementing
 * Cronometer's (undocumented) API — it just reuses the already-working
 * cronometer-api-mcp over stdio.
 *
 * Usage (all via env vars CRONOMETER_USERNAME/CRONOMETER_PASSWORD/etc, same as
 * every other pantry-mcp bridge script):
 *   node cronometer-bridge.js fetch [date]
 *   node cronometer-bridge.js remove <entry_id> [date]
 *   node cronometer-bridge.js update <entry_id> <food_id> <measure_id> <grams> [date]
 *
 * "update" has no direct equivalent in cronometer-api-mcp — it's implemented as
 * remove-then-add. "remove" and "update" both print {"status":"ok"} on success;
 * the caller re-fetches afterward for up-to-date data rather than this script
 * duplicating the "fetch" formatting for a mutation response.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type Nutrient = { id: number; name: string | null; amount: number; unit: string | null; category?: string | null };
type DiaryEntry = {
  type?: string;
  servingId?: number;
  foodId?: number;
  measureId?: number;
  name: string;
  time?: string;
  grams?: number;
  servings?: number;
  measure?: { name?: string };
  nutrients?: Nutrient[];
};

/** Cronometer nutrient IDs for the macros shown per food row. */
const NUTRIENT_IDS = { calories: 208, protein: 203, carbs: 205, fat: 204, fiber: 291 } as const;

function macro(nutrients: Nutrient[] | undefined, id: number): number | null {
  const value = nutrients?.find((n) => n.id === id)?.amount;
  return value === undefined ? null : value;
}

async function connect(): Promise<Client> {
  // Prefer an absolute path (passed by the Laravel backend, which resolves it itself
  // rather than trusting its own possibly-stale inherited PATH) over a bare "uvx"
  // that depends on this process's PATH lookup succeeding.
  const uvxCommand = process.env.CRONOMETER_UVX_PATH || "uvx";

  const transport = new StdioClientTransport({
    command: uvxCommand,
    args: ["cronometer-api-mcp"],
    env: process.env as Record<string, string>,
  });
  const client = new Client({ name: "cronometer-bridge", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

async function callJson(client: Client, name: string, args: Record<string, unknown>): Promise<any> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text?: string }> | undefined;
  const block = content?.[0];
  if (!block || block.type !== "text" || !block.text) {
    throw new Error(`Unexpected response from cronometer MCP tool ${name}`);
  }
  const data = JSON.parse(block.text);
  if (result.isError || data.status === "error") {
    throw new Error(data.message ?? `${name} failed`);
  }
  return data;
}

/**
 * Cronometer's own "% of all your nutrition targets reached today" score — the only
 * target-adherence figure this MCP server actually exposes. Individual nutrients each
 * have a `confidence` field (data-quality, not target progress — verified by
 * comparing values, it's unrelated to how close a nutrient is to its target), and no
 * tool here returns a per-nutrient target amount to compute a percentage against, so
 * this single aggregate is the only honest "percentage toward Cronometer's
 * recommendations" available. Never lets a failure here break the rest of the diary
 * fetch — it's a nice-to-have on top of the food log, not core to it.
 */
async function fetchNutritionScore(client: Client, date: string | undefined): Promise<number | null> {
  try {
    const data = await callJson(client, "get_nutrition_scores", date ? { date } : {});
    const total = (data.scores?.scores ?? []).find((s: { id?: string }) => s.id === "TotalTargets");
    return typeof total?.score === "number" ? Math.round(total.score) : null;
  } catch {
    return null;
  }
}

async function fetchDiary(client: Client, date: string | undefined): Promise<void> {
  const data = await callJson(client, "get_food_log", date ? { date } : {});
  const nutritionScore = await fetchNutritionScore(client, date);

  const energy = data.energy_summary ?? {};
  const macros = data.nutrition_summary?.macros ?? {};
  const diaryEntries: DiaryEntry[] = data.diary?.diary ?? [];

  const foods = diaryEntries
    .filter((entry) => entry.type === "Serving")
    .map((entry) => {
      const amount = entry.measure?.name
        ? `${entry.grams ?? entry.servings}${entry.measure.name}`
        : entry.servings
          ? `${entry.servings} serving(s)`
          : null;

      return {
        id: entry.servingId !== undefined ? String(entry.servingId) : null,
        food_id: entry.foodId ?? null,
        measure_id: entry.measureId ?? null,
        grams: entry.grams ?? null,
        name: entry.name,
        time: entry.time ?? null,
        amount,
        calories: macro(entry.nutrients, NUTRIENT_IDS.calories),
        protein_g: macro(entry.nutrients, NUTRIENT_IDS.protein),
        carbs_g: macro(entry.nutrients, NUTRIENT_IDS.carbs),
        fat_g: macro(entry.nutrients, NUTRIENT_IDS.fat),
        fiber_g: macro(entry.nutrients, NUTRIENT_IDS.fiber),
      };
    });

  // The day-level nutrient totals (every nutrient the user tracks in Cronometer,
  // not just the four headline macros) — for a "show more" panel. A handful of
  // entries come back with a null name/unit (internal/derived values Cronometer
  // doesn't display), which aren't meaningful to show, so those are dropped.
  const nutrients = ((data.nutrition_summary?.nutrients ?? []) as Nutrient[])
    .filter((n) => n.name && n.unit)
    .map((n) => ({ id: n.id, name: n.name, amount: n.amount, unit: n.unit, category: n.category ?? null }));

  const output = {
    date: data.date,
    nutrition_score: nutritionScore,
    calories: {
      consumed: Math.round(energy.consumed_kcal ?? 0),
      target: energy.total_target_kcal !== undefined ? Math.round(energy.total_target_kcal) : null,
      remaining: energy.remaining_kcal !== undefined ? Math.round(energy.remaining_kcal) : null,
    },
    macros: {
      protein_g: macros.protein ?? null,
      carbs_g: macros.carbs ?? null,
      fat_g: macros.fat ?? null,
      fiber_g: macros.fiber ?? null,
    },
    foods,
    nutrients,
  };

  process.stdout.write(JSON.stringify(output));
}

async function removeEntry(client: Client, entryId: string, date: string | undefined): Promise<void> {
  await callJson(client, "remove_food_entry", { entry_ids: [entryId], ...(date ? { date } : {}) });
  process.stdout.write(JSON.stringify({ status: "ok" }));
}

async function updateEntry(
  client: Client,
  entryId: string,
  foodId: number,
  measureId: number,
  grams: number,
  date: string | undefined
): Promise<void> {
  // No direct "edit amount" tool exists — remove the old entry and add a fresh one
  // with the same food/measure but the new amount.
  await callJson(client, "remove_food_entry", { entry_ids: [entryId], ...(date ? { date } : {}) });
  await callJson(client, "add_food_entry", {
    food_id: foodId,
    measure_id: measureId,
    grams,
    ...(date ? { date } : {}),
  });
  process.stdout.write(JSON.stringify({ status: "ok" }));
}

async function main() {
  const [action, ...rest] = process.argv.slice(2);
  const client = await connect();

  try {
    switch (action) {
      case "fetch":
        await fetchDiary(client, rest[0]);
        break;
      case "remove":
        if (!rest[0]) throw new Error("Usage: cronometer-bridge.js remove <entry_id> [date]");
        await removeEntry(client, rest[0], rest[1]);
        break;
      case "update":
        if (!rest[0] || !rest[1] || !rest[2] || !rest[3]) {
          throw new Error("Usage: cronometer-bridge.js update <entry_id> <food_id> <measure_id> <grams> [date]");
        }
        await updateEntry(client, rest[0], Number(rest[1]), Number(rest[2]), Number(rest[3]), rest[4]);
        break;
      default:
        throw new Error(`Unknown action "${action}". Expected fetch, remove, or update.`);
    }
  } finally {
    await client.close();
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
