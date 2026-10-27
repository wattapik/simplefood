#!/usr/bin/env node
/**
 * One-shot bridge: fetches a single Cronometer food's nutrition facts (per 100g)
 * via cronometer-api-mcp, for the Laravel backend to use when computing pantry
 * statistics. Cheap to cache long-term since a given food's nutrition doesn't change.
 *
 * Usage: CRONOMETER_USERNAME=... CRONOMETER_PASSWORD=... node food-nutrition-bridge.js <food_id>
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Cronometer nutrient ids for the basic figures we surface (same ones used by
// cronometer-bridge.ts's calorie/macro summary, and confirmed against real
// get_food_details/get_food_log output: these amounts are per 100g of the food).
const NUTRIENT_IDS = {
  calories: 208,
  protein_g: 203,
  carbs_g: 205,
  fat_g: 204,
  fiber_g: 291,
} as const;

async function main() {
  const foodId = Number(process.argv[2]);
  if (!Number.isInteger(foodId)) {
    throw new Error("Usage: food-nutrition-bridge.js <food_id>");
  }

  const uvxCommand = process.env.CRONOMETER_UVX_PATH || "uvx";
  const transport = new StdioClientTransport({
    command: uvxCommand,
    args: ["cronometer-api-mcp"],
    env: process.env as Record<string, string>,
  });
  const client = new Client({ name: "food-nutrition-bridge", version: "1.0.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "get_food_details",
    arguments: { food_id: foodId },
  });

  await client.close();

  const content = result.content as Array<{ type: string; text?: string }> | undefined;
  const block = content?.[0];
  if (!block || block.type !== "text" || !block.text) {
    throw new Error("Unexpected response from cronometer MCP");
  }

  const data = JSON.parse(block.text);
  if (data.status !== "success") {
    throw new Error(data.message ?? "Cronometer request failed");
  }

  const nutrients: Array<{ id: number; amount: number }> = data.nutrients ?? [];
  const find = (id: number) => nutrients.find((n) => n.id === id)?.amount ?? 0;

  const output = {
    food_id: foodId,
    name: data.name ?? null,
    per_100g: {
      calories: find(NUTRIENT_IDS.calories),
      protein_g: find(NUTRIENT_IDS.protein_g),
      carbs_g: find(NUTRIENT_IDS.carbs_g),
      fat_g: find(NUTRIENT_IDS.fat_g),
      fiber_g: find(NUTRIENT_IDS.fiber_g),
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
