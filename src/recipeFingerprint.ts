import type { Ingredient, Recipe } from "./types.js";

const RECIPE_KNOWN = new Set([
  "id",
  "stations",
  "inputs",
  "outputs",
  "type",
  "pattern",
  "key",
  "leftover",
  "priority",
  "duration",
  "energy",
  "extra",
]);

function compactIngredient(ingredient: Ingredient): unknown {
  if (typeof ingredient === "string") return ingredient;
  const count = ingredient.count ?? 1;
  const hasTag = ingredient.tag !== undefined;
  const hasSlot = ingredient.slot !== undefined;
  const hasTags = ingredient.tags !== undefined && ingredient.tags.length > 0;
  if (ingredient.item !== undefined && !hasTag && !hasSlot && !hasTags && count === 1) return ingredient.item;
  const out: Record<string, unknown> = {};
  if (ingredient.item !== undefined) out.item = ingredient.item;
  if (hasTag) out.tag = ingredient.tag;
  if (count !== 1) out.count = count;
  if (hasSlot) out.slot = ingredient.slot;
  if (hasTags) out.tags = ingredient.tags;
  return out;
}

function compactRecipe(recipe: Recipe): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: recipe.id,
    stations: [...recipe.stations],
    inputs: recipe.inputs.map(compactIngredient),
    outputs: recipe.outputs.map(compactIngredient),
  };
  if (recipe.type !== undefined) out.type = recipe.type;
  if (recipe.pattern !== undefined) out.pattern = [...recipe.pattern];
  if (recipe.key !== undefined) {
    const key: Record<string, unknown> = {};
    for (const [symbol, ingredient] of Object.entries(recipe.key)) {
      key[symbol] = compactIngredient(ingredient);
    }
    out.key = key;
  }
  if (recipe.leftover !== undefined) out.leftover = compactIngredient(recipe.leftover);
  if (recipe.priority !== undefined) out.priority = recipe.priority;
  if (recipe.duration !== undefined && recipe.duration >= 1) out.duration = recipe.duration;
  if (recipe.energy !== undefined) out.energy = recipe.energy;
  if (recipe.extra !== undefined && Object.keys(recipe.extra).length > 0) out.extra = recipe.extra;
  for (const [key, value] of Object.entries(recipe)) {
    if (RECIPE_KNOWN.has(key) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Canonical fingerprint of a recipe set (stable sort by `id`, compact JSON).
 */
export function canonicalizeRecipes(recipes: readonly Recipe[]): string {
  const normalized = recipes.map(compactRecipe);
  normalized.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify(normalized);
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (typeof value !== "object" || value === null) return value;
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    const next = rec[key];
    if (next !== undefined) out[key] = stableJson(next);
  }
  return out;
}

/**
 * Canonical fingerprint of generic documents (sort by `id`, stable object keys).
 */
export function canonicalizeDocuments(documents: readonly { id: string }[]): string {
  const normalized = documents.map((doc) => stableJson(doc) as { id: string });
  normalized.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(normalized);
}
