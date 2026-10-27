#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ApiError, pantryApi, recipesApi, sproutsApi, type PantryItem, type Recipe, type Sprout } from "./api.js";

const server = new McpServer({
  name: "pantry-mcp",
  version: "1.0.0",
});

function summarize(item: PantryItem): string {
  let text = `#${item.id} ${item.name}`;
  if (item.brand) text += ` (${item.brand})`;
  text += ` — ${item.quantity}${item.unit} in the ${item.location}`;
  if (item.opened_at) text += ", opened";
  if (item.effective_expiration_date) text += `, expires ${item.effective_expiration_date}`;
  if (item.is_expired) text += " [EXPIRED]";
  else if (item.is_expiring_soon) text += " [expiring soon]";
  return text;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function summarizeRecipe(recipe: Recipe): string {
  const ingredients = recipe.ingredients.map((i) => `${i.quantity}${i.unit} ${i.name}`).join(", ");
  let text = `#${recipe.id} ${recipe.name} (made ${recipe.made_at}): ${ingredients}`;
  if (recipe.notes) text += ` — ${recipe.notes}`;
  return text;
}

function summarizeSprout(sprout: Sprout): string {
  let text = `#${sprout.id} ${sprout.seed_name} in ${sprout.medium}`;
  if (sprout.seed_quantity) text += ` (started from ${sprout.seed_quantity}${sprout.seed_unit} seed)`;
  text += `, started ${sprout.started_at.slice(0, 10)}`;
  if (sprout.is_harvested) {
    text += `, harvested ${sprout.harvested_at?.slice(0, 10)}`;
    if (sprout.pantry_item_id) text += ` -> pantry item #${sprout.pantry_item_id}`;
  } else if (sprout.estimated_ready_at) {
    text += `, estimated ready ${sprout.estimated_ready_at}`;
    if (sprout.is_overdue) text += " [past estimated ready date]";
  }
  if (sprout.notes) text += ` — ${sprout.notes}`;
  return text;
}

/**
 * Resolve a pantry item id from either an explicit id or a fuzzy name search, shared
 * by every tool below that identifies an item this way (consume, mark opened, ...).
 */
async function findItemId(
  name: string | undefined,
  id: number | undefined
): Promise<{ id: number } | { message: string }> {
  if (id) return { id };

  if (!name) {
    return { message: "Provide either an id or a name to identify the pantry item." };
  }

  const matches = await pantryApi.list({ search: name });

  if (matches.length === 0) {
    return { message: `No pantry item matching "${name}" was found.` };
  }

  if (matches.length > 1) {
    return {
      message:
        `Multiple pantry items match "${name}" — call again with an exact id:\n` + matches.map(summarize).join("\n"),
    };
  }

  return { id: matches[0].id };
}

/**
 * Resolve a sprout batch id from either an explicit id or a fuzzy seed-name search,
 * shared by update/remove/harvest below. Defaults to searching only still-growing
 * batches (the common case — you don't usually need to touch an already-harvested
 * one by name), unless includeHarvested is set.
 */
async function findSproutId(
  name: string | undefined,
  id: number | undefined,
  includeHarvested = false
): Promise<{ id: number } | { message: string }> {
  if (id) return { id };

  if (!name) {
    return { message: "Provide either an id or the seed name to identify the sprout batch." };
  }

  const all = await sproutsApi.list(includeHarvested ? undefined : "growing");
  const needle = name.toLowerCase();
  const matches = all.filter((s) => s.seed_name.toLowerCase().includes(needle));

  if (matches.length === 0) {
    return { message: `No sprout batch matching "${name}" was found.` };
  }

  if (matches.length > 1) {
    return {
      message:
        `Multiple sprout batches match "${name}" — call again with an exact id:\n` +
        matches.map(summarizeSprout).join("\n"),
    };
  }

  return { id: matches[0].id };
}

server.registerTool(
  "list_pantry_items",
  {
    title: "List pantry items",
    description:
      "List food currently in the pantry/fridge/freezer, optionally filtered by location, category, a name search, or items expiring within N days.",
    inputSchema: {
      location: z.enum(["fridge", "pantry", "freezer"]).optional(),
      category: z.string().optional(),
      search: z.string().optional().describe("Case-insensitive substring match on the item name"),
      expiring_within_days: z.number().int().optional(),
    },
  },
  async ({ location, category, search, expiring_within_days }) => {
    const items = await pantryApi.list({
      location,
      category,
      search,
      expiring_within_days,
    });

    if (items.length === 0) {
      return textResult("No matching pantry items.");
    }

    return textResult(items.map(summarize).join("\n"));
  }
);

server.registerTool(
  "get_expiring_soon",
  {
    title: "Get food expiring soon",
    description: "List pantry items that expire within the given number of days (default 4).",
    inputSchema: {
      days: z.number().int().min(0).default(4),
    },
  },
  async ({ days }) => {
    const items = await pantryApi.list({ expiring_within_days: days });
    if (items.length === 0) {
      return textResult(`Nothing expiring in the next ${days} day(s).`);
    }
    return textResult(items.map(summarize).join("\n"));
  }
);

server.registerTool(
  "add_pantry_item",
  {
    title: "Add a pantry item",
    description:
      "Add a food item to the pantry database, e.g. after buying groceries or importing a food found via the " +
      "cronometer search_foods/get_food_details tools. Before calling this, call the cronometer MCP's " +
      "search_foods with the food the user described, and if there's a reasonable match, use that result's " +
      "exact 'name' field for this tool's `name` argument (instead of rephrasing what the user said) and pass " +
      "its `food_id` as `cronometer_food_id`. This keeps the pantry entry, Cronometer's own food picker, and " +
      "future diary logging all referring to the exact same food. If nothing matches well, just use the name " +
      "the user gave and leave cronometer_food_id unset.",
    inputSchema: {
      name: z.string(),
      brand: z.string().optional(),
      quantity: z.number().positive(),
      unit: z.string().describe("e.g. g, kg, ml, l, pcs"),
      category: z.string().optional().describe("e.g. Grains, Dairy, Produce, Meat, Snacks"),
      location: z.enum(["fridge", "pantry", "freezer"]),
      expiration_date: z.string().optional().describe("YYYY-MM-DD, omit if not applicable"),
      cronometer_food_id: z
        .string()
        .optional()
        .describe("The food_id from the cronometer MCP's search_foods result you matched, so future consume_pantry_item calls log the exact same food"),
      notes: z.string().optional(),
    },
  },
  async (payload) => {
    const item = await pantryApi.create(payload);
    return textResult(`Added: ${summarize(item)}`);
  }
);

server.registerTool(
  "update_pantry_item",
  {
    title: "Update a pantry item",
    description:
      "Edit fields on an existing pantry item by its id (from list_pantry_items). To record that an item was " +
      "opened, prefer mark_pantry_item_opened — it's the same thing but doesn't require knowing the id in advance.",
    inputSchema: {
      id: z.number().int(),
      name: z.string().optional(),
      brand: z.string().optional(),
      quantity: z.number().min(0).optional(),
      unit: z.string().optional(),
      category: z.string().optional(),
      location: z.enum(["fridge", "pantry", "freezer"]).optional(),
      expiration_date: z.string().nullable().optional().describe("YYYY-MM-DD, or null to clear"),
      opened_at: z
        .string()
        .nullable()
        .optional()
        .describe("ISO datetime this was opened, or null to mark it unopened again"),
      opened_expiration_date: z
        .string()
        .nullable()
        .optional()
        .describe("YYYY-MM-DD estimate of how long it's good for once opened — only set this if the user told you, never invent one"),
      cronometer_food_id: z.string().optional(),
      notes: z.string().nullable().optional(),
    },
  },
  async ({ id, ...payload }) => {
    const item = await pantryApi.update(id, payload);
    return textResult(`Updated: ${summarize(item)}`);
  }
);

server.registerTool(
  "mark_pantry_item_opened",
  {
    title: "Mark a pantry item as opened",
    description:
      "Record that a pantry item has been opened (e.g. the user says 'I just opened the milk'), identified by " +
      "name (fuzzy match) or exact id. Sets opened-at to now. Only pass opened_expiration_date if the user tells " +
      "you how long it's good for once opened (or you can see it in their message, e.g. 'good for about a week') " +
      "— do not invent a shelf-life estimate yourself, there's no reliable data for that and a wrong guess is a " +
      "food-safety question, not a cosmetic one. If you don't know it, just leave it unset and ask the user only " +
      "if they seem to want it tracked precisely; otherwise it's fine to leave it for them to fill in later in the app.",
    inputSchema: {
      name: z.string().optional().describe("Name (or part of it) of the pantry item, used to find it if id is not given"),
      id: z.number().int().optional().describe("Exact pantry item id, if already known"),
      opened_expiration_date: z
        .string()
        .optional()
        .describe("YYYY-MM-DD, only if the user told you how long it's good for once opened"),
    },
  },
  async ({ name, id, opened_expiration_date }) => {
    const resolved = await findItemId(name, id);
    if ("message" in resolved) return textResult(resolved.message);

    const item = await pantryApi.update(resolved.id, {
      opened_at: new Date().toISOString(),
      opened_expiration_date: opened_expiration_date ?? null,
    });

    return textResult(`Marked opened: ${summarize(item)}`);
  }
);

server.registerTool(
  "remove_pantry_item",
  {
    title: "Remove a pantry item",
    description: "Delete a pantry item entirely by its id, e.g. it went bad or was thrown out.",
    inputSchema: {
      id: z.number().int(),
    },
  },
  async ({ id }) => {
    await pantryApi.remove(id);
    return textResult(`Removed item #${id}.`);
  }
);

server.registerTool(
  "consume_pantry_item",
  {
    title: "Deduct eaten/used food from the pantry",
    description:
      "Deduct an amount that was eaten or used from a pantry item, identified by name (fuzzy match) or exact id. " +
      "Use this whenever the user says what they ate, e.g. '100g oats' -> name='oats', quantity=100, unit='g'. " +
      "Deletes the item once it reaches zero. If the name matches multiple or zero items, it reports that instead of guessing. " +
      "Whenever you call this because the user ate something, ALSO log it to Cronometer in the same turn using the " +
      "cronometer MCP's search_foods (to find the closest matching food) and add_food_entry tools — do this " +
      "automatically without asking for confirmation first. Only ask the user if the pantry item can't be found, " +
      "or if Cronometer has no reasonably close food match.",
    inputSchema: {
      name: z
        .string()
        .optional()
        .describe("Name (or part of it) of the pantry item, used to find it if id is not given"),
      id: z.number().int().optional().describe("Exact pantry item id, if already known"),
      quantity: z.number().positive(),
      unit: z.string().describe("Unit the quantity is expressed in, e.g. g, kg, ml, l"),
    },
  },
  async ({ name, id, quantity, unit }) => {
    const resolved = await findItemId(name, id);
    if ("message" in resolved) return textResult(`${resolved.message} Nothing deducted.`);
    const targetId = resolved.id;

    const cronometerFoodId = (await pantryApi.get(targetId)).cronometer_food_id;

    const reminder = cronometerFoodId
      ? `Now log this in Cronometer too: this pantry item is linked to Cronometer food_id=${cronometerFoodId}, so ` +
        "call the cronometer MCP's get_food_details for that food_id to find its \"g\" measure_id, then call " +
        "add_food_entry with that food_id, measure_id, and this amount in grams — do NOT call search_foods again, " +
        "reuse this exact food so the pantry, Cronometer's picker, and the diary all agree on what it is. Do this " +
        "automatically — do not ask the user for confirmation first."
      : "Now log this in Cronometer too: call the cronometer MCP's search_foods for a matching food, then " +
        "add_food_entry with this amount. Do this automatically — do not ask the user for confirmation first.";

    try {
      const item = await pantryApi.consume(targetId, quantity, unit);
      if (!item) {
        return textResult(
          `Consumed the last of item #${targetId} — it has been removed from the pantry.\n\n${reminder}`
        );
      }
      return textResult(`Deducted ${quantity}${unit}. Remaining: ${summarize(item)}\n\n${reminder}`);
    } catch (error) {
      if (error instanceof ApiError) {
        return textResult(`Could not deduct: ${error.message}`);
      }
      throw error;
    }
  }
);

server.registerTool(
  "record_recipe",
  {
    title: "Record a recipe",
    description:
      "Record one instance of making a dish, e.g. the user says 'I made vegetable soup' and lists what went in " +
      "it. Call this every time, even for a dish recorded before — a recipe here is a record of what actually " +
      "went in on a specific occasion, not a single canonical version to edit, since amounts and ingredients " +
      "naturally drift from one time to the next (someone might add 50g more carrots next time). List every " +
      "ingredient the user mentioned, with their stated quantity and unit. For each ingredient, you may " +
      "optionally call the cronometer MCP's search_foods and include a matching food_id as cronometer_food_id " +
      "if there's a clearly good match — this enables nutrition info for the recipe later — but this is " +
      "best-effort only, not required for every ingredient; don't block on it or ask the user, just skip linking " +
      "for anything that's not a quick, confident match.",
    inputSchema: {
      name: z.string().describe("The dish's name, e.g. 'Vegetable Soup'"),
      made_at: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      ingredients: z
        .array(
          z.object({
            name: z.string(),
            quantity: z.number().positive(),
            unit: z.string().describe("e.g. g, kg, ml, l, pcs, tbsp"),
            cronometer_food_id: z.string().optional(),
          })
        )
        .min(1),
      notes: z.string().optional().describe("Anything worth remembering about this instance, e.g. 'a bit too salty'"),
    },
  },
  async (payload) => {
    const recipe = await recipesApi.create(payload);
    return textResult(`Recorded: ${summarizeRecipe(recipe)}`);
  }
);

server.registerTool(
  "update_recipe",
  {
    title: "Fix or extend a recorded recipe",
    description:
      "Correct or add to an already-recorded recipe entry — e.g. the user says 'actually it was 250g of " +
      "carrots' or 'I forgot to mention I also added a potato' about something you (or they) already recorded. " +
      "Use list_recipes first to find the id if you don't already have it from this conversation. This edits " +
      "that exact entry in place — it does NOT create a new one. Only use this for correcting/completing what " +
      "was recorded for that specific occasion; if the user actually made the dish again (a new, separate " +
      "occasion), use record_recipe instead, even if it's the same dish name. `ingredients`, if given, replaces " +
      "the entire ingredient list — include every ingredient that should remain, not just the changed one.",
    inputSchema: {
      id: z.number().int().describe("The recipe's id, from list_recipes"),
      ingredients: z
        .array(
          z.object({
            name: z.string(),
            quantity: z.number().positive(),
            unit: z.string(),
            cronometer_food_id: z.string().optional(),
          })
        )
        .min(1)
        .optional()
        .describe("The full, corrected ingredient list — replaces the existing one entirely"),
      notes: z.string().optional(),
    },
  },
  async ({ id, ...payload }) => {
    const recipe = await recipesApi.update(id, payload);
    return textResult(`Updated: ${summarizeRecipe(recipe)}`);
  }
);

server.registerTool(
  "list_recipes",
  {
    title: "List or search recorded recipes",
    description:
      "List previously recorded recipes, optionally filtered by a name search (e.g. 'vegetable soup'). Every " +
      "instance of making a dish is its own entry, so the same name can appear multiple times with different " +
      "dates and ingredients — this returns all matching entries, most recently made first, so you can see how " +
      "a dish has changed over time or just pull up what went in it last time.",
    inputSchema: {
      search: z.string().optional().describe("Case-insensitive substring match on the recipe name"),
    },
  },
  async ({ search }) => {
    const recipes = await recipesApi.list(search);
    if (recipes.length === 0) {
      return textResult(search ? `No recipes matching "${search}".` : "No recipes recorded yet.");
    }
    return textResult(recipes.map(summarizeRecipe).join("\n"));
  }
);

server.registerTool(
  "start_sprouting",
  {
    title: "Start tracking a batch of sprouting seeds",
    description:
      "Record that the user has just set some seeds to sprout, e.g. 'I've just set 50g of broccoli seeds to " +
      "sprout inside dirt' -> seed_name='Broccoli seeds', medium='dirt tray', seed_quantity=50, seed_unit='g'. " +
      "Tag `medium` yourself from how they described the growing setup — use a short, consistent label like " +
      "'sprout jar' or 'dirt tray' rather than repeating their exact words. seed_quantity/seed_unit are optional " +
      "— if the user doesn't say how much seed they used, just omit them; it's fine for this to exist without an " +
      "amount. You MUST estimate `estimated_ready_at` yourself from your own general knowledge of how long that " +
      "kind of seed typically takes to sprout to an edible size in that medium (e.g. most jar-grown sprouts like " +
      "broccoli, alfalfa, or mung bean are ready in about 3-6 days; a dirt-grown microgreen tray is usually more " +
      "like 7-14 days) — add that many days to today's date. Don't ask the user for this estimate; give your best " +
      "guess and let them correct it later via update_sprout if you were off.",
    inputSchema: {
      seed_name: z.string().describe("e.g. 'Broccoli seeds'"),
      medium: z.string().describe("Short tag for the growing medium/setup, e.g. 'sprout jar', 'dirt tray'"),
      seed_quantity: z.number().positive().optional().describe("Omit if the user didn't say an amount"),
      seed_unit: z.string().optional().describe("e.g. g, required if seed_quantity is given"),
      estimated_ready_at: z.string().describe("YYYY-MM-DD, your best-guess date this batch will be edible"),
      notes: z.string().optional(),
    },
  },
  async (payload) => {
    const sprout = await sproutsApi.create(payload);
    return textResult(`Tracking: ${summarizeSprout(sprout)}`);
  }
);

server.registerTool(
  "list_sprouts",
  {
    title: "List sprout batches",
    description: "List tracked sprout batches, optionally filtered to only still-growing or only harvested ones.",
    inputSchema: {
      status: z.enum(["growing", "harvested"]).optional(),
    },
  },
  async ({ status }) => {
    const sprouts = await sproutsApi.list(status);
    if (sprouts.length === 0) {
      return textResult(status ? `No ${status} sprout batches.` : "No sprout batches tracked yet.");
    }
    return textResult(sprouts.map(summarizeSprout).join("\n"));
  }
);

server.registerTool(
  "update_sprout",
  {
    title: "Correct a tracked sprout batch",
    description:
      "Fix or extend an already-tracked sprout batch's details — e.g. the medium, seed amount, or estimated " +
      "ready date was wrong. Identify it by seed name (fuzzy match against still-growing batches) or exact id. " +
      "This does not mark it harvested — use harvest_sprout for that.",
    inputSchema: {
      name: z.string().optional().describe("Seed name (or part of it), used to find the batch if id is not given"),
      id: z.number().int().optional().describe("Exact sprout batch id, if already known"),
      seed_name: z.string().optional(),
      medium: z.string().optional(),
      seed_quantity: z.number().min(0).optional(),
      seed_unit: z.string().optional(),
      estimated_ready_at: z.string().optional().describe("YYYY-MM-DD"),
      notes: z.string().optional(),
    },
  },
  async ({ name, id, ...payload }) => {
    const resolved = await findSproutId(name, id);
    if ("message" in resolved) return textResult(resolved.message);

    const sprout = await sproutsApi.update(resolved.id, payload);
    return textResult(`Updated: ${summarizeSprout(sprout)}`);
  }
);

server.registerTool(
  "remove_sprout",
  {
    title: "Stop tracking a sprout batch",
    description:
      "Delete a tracked sprout batch entirely, e.g. it went moldy and was thrown out. Identify it by seed name " +
      "(fuzzy match against still-growing batches) or exact id. Does not affect the fridge if it was already " +
      "harvested — that pantry item is left alone.",
    inputSchema: {
      name: z.string().optional().describe("Seed name (or part of it), used to find the batch if id is not given"),
      id: z.number().int().optional().describe("Exact sprout batch id, if already known"),
    },
  },
  async ({ name, id }) => {
    const resolved = await findSproutId(name, id, true);
    if ("message" in resolved) return textResult(resolved.message);

    await sproutsApi.remove(resolved.id);
    return textResult(`Removed sprout batch #${resolved.id}.`);
  }
);

server.registerTool(
  "harvest_sprout",
  {
    title: "Mark sprouts as grown and move them to the fridge",
    description:
      "Record that a tracked sprout batch has finished growing and is ready to eat — e.g. the user says 'my " +
      "broccoli sprouts are done' or 'I finished growing my sprouts'. Identify the batch by seed name (fuzzy " +
      "match against still-growing batches) or exact id. This creates a new pantry item for it in the fridge and " +
      "marks the batch harvested. You MUST estimate `expiration_date` yourself from general knowledge of how " +
      "long fresh sprouts keep once harvested and refrigerated — typically about 5-7 days for jar sprouts (e.g. " +
      "broccoli, alfalfa, mung bean), somewhat longer for a living microgreen tray if kept planted. Don't ask the " +
      "user for this; give your best estimate. Only pass quantity/unit if the user tells you how much they " +
      "actually harvested (this is independent of the original seed weight, since sprouts grow well beyond it) " +
      "— if they don't say, just omit both and the fridge item will still be recorded, just without an amount.",
    inputSchema: {
      name: z.string().optional().describe("Seed name (or part of it), used to find the batch if id is not given"),
      id: z.number().int().optional().describe("Exact sprout batch id, if already known"),
      quantity: z.number().positive().optional().describe("Omit if the user didn't say how much they harvested"),
      unit: z.string().optional().describe("e.g. g, required if quantity is given"),
      expiration_date: z.string().describe("YYYY-MM-DD, your best estimate of how long this keeps in the fridge"),
      notes: z.string().optional(),
    },
  },
  async ({ name, id, ...payload }) => {
    const resolved = await findSproutId(name, id);
    if ("message" in resolved) return textResult(resolved.message);

    try {
      const sprout = await sproutsApi.harvest(resolved.id, payload);
      return textResult(`Harvested and moved to the fridge: ${summarizeSprout(sprout)}`);
    } catch (error) {
      if (error instanceof ApiError) {
        return textResult(`Could not harvest: ${error.message}`);
      }
      throw error;
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
