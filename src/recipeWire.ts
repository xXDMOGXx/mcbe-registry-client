import type { Ingredient, IngredientObject, ListEntry, MatchQuery, MatchResult, Recipe } from "./types.js";

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

/** Wire ingredient shape (matches `IngredientWire`). */
export interface IngredientWireMsg {
  item?: string;
  tag?: string;
  fluid?: string;
  gas?: string;
  count?: number;
  amount?: number;
  slot?: string;
  tags?: string[];
}

/** Wire recipe shape (matches `RecipeWire`). Optional PROTO fields are `| undefined`. */
export interface RecipeWireMsg {
  id: string;
  stations: string[];
  inputs: IngredientWireMsg[];
  outputs: IngredientWireMsg[];
  type: string | undefined;
  pattern: string[] | undefined;
  key: Map<string, IngredientWireMsg> | undefined;
  leftover: IngredientWireMsg | undefined;
  priority: number | undefined;
  duration: number | undefined;
  energy: number | undefined;
  extensions: string | undefined;
}

/** Wire match-result shape. */
export interface MatchResultWireMsg {
  outputs: IngredientWireMsg[];
  leftover: IngredientWireMsg | undefined;
  duration: number | undefined;
  energy: number | undefined;
  type: string | undefined;
  extensions: string | undefined;
}

/** Wire list-entry shape. */
export interface ListEntryWireMsg {
  id: string;
  type: string | undefined;
  stations: string[];
  leftover: IngredientWireMsg | undefined;
}

/** Domain ingredient → wire object. */
export function encodeIngredient(ingredient: Ingredient): IngredientWireMsg {
  if (typeof ingredient === "string") return { item: ingredient };
  const out: IngredientWireMsg = {};
  if (ingredient.item !== undefined) out.item = ingredient.item;
  if (ingredient.tag !== undefined) out.tag = ingredient.tag;
  if (ingredient.fluid !== undefined) out.fluid = ingredient.fluid;
  if (ingredient.gas !== undefined) out.gas = ingredient.gas;
  if (ingredient.count !== undefined) out.count = ingredient.count;
  if (ingredient.amount !== undefined) out.amount = ingredient.amount;
  if (ingredient.slot !== undefined) out.slot = ingredient.slot;
  if (ingredient.tags !== undefined && ingredient.tags.length > 0) out.tags = [...ingredient.tags];
  return out;
}

/** Wire ingredient → domain (shorthand string when only `item`). */
export function decodeIngredient(wire: IngredientWireMsg): Ingredient {
  const hasTag = wire.tag !== undefined;
  const hasSlot = wire.slot !== undefined;
  const hasTags = wire.tags !== undefined && wire.tags.length > 0;
  const hasFluid = wire.fluid !== undefined;
  const hasGas = wire.gas !== undefined;
  const count = wire.count ?? 1;
  if (wire.item !== undefined && !hasTag && !hasSlot && !hasTags && !hasFluid && !hasGas && count === 1) {
    return wire.item;
  }
  const out: IngredientObject = {};
  if (wire.item !== undefined) out.item = wire.item;
  if (hasTag) out.tag = wire.tag;
  if (hasFluid) out.fluid = wire.fluid;
  if (hasGas) out.gas = wire.gas;
  if (count !== 1) out.count = count;
  if (wire.amount !== undefined) out.amount = wire.amount;
  if (hasSlot) out.slot = wire.slot;
  if (hasTags) out.tags = wire.tags;
  return out;
}

function extensionsFromRecipe(recipe: Recipe): string | undefined {
  const bag: Record<string, unknown> = {};
  if (recipe.extra !== undefined && Object.keys(recipe.extra).length > 0) bag.extra = recipe.extra;
  for (const [key, value] of Object.entries(recipe)) {
    if (RECIPE_KNOWN.has(key) || value === undefined) continue;
    bag[key] = value;
  }
  if (Object.keys(bag).length === 0) return undefined;
  return JSON.stringify(bag);
}

function applyExtensions(recipe: Recipe, extensions: string | undefined): void {
  if (extensions === undefined || extensions.length === 0) return;
  let bag: unknown;
  try {
    bag = JSON.parse(extensions) as unknown;
  } catch {
    return;
  }
  if (typeof bag !== "object" || bag === null || Array.isArray(bag)) return;
  const rec = bag as Record<string, unknown>;
  if (rec.extra !== undefined && typeof rec.extra === "object" && rec.extra !== null && !Array.isArray(rec.extra)) {
    recipe.extra = rec.extra as Record<string, unknown>;
  }
  for (const [key, value] of Object.entries(rec)) {
    if (key === "extra" || RECIPE_KNOWN.has(key)) continue;
    recipe[key] = value;
  }
}

/** Domain recipe → wire. */
export function encodeRecipe(recipe: Recipe): RecipeWireMsg {
  let key: Map<string, IngredientWireMsg> | undefined;
  if (recipe.key !== undefined) {
    key = new Map();
    for (const [symbol, ingredient] of Object.entries(recipe.key)) {
      key.set(symbol, encodeIngredient(ingredient));
    }
  }
  return {
    id: recipe.id,
    stations: [...recipe.stations],
    inputs: recipe.inputs.map(encodeIngredient),
    outputs: recipe.outputs.map(encodeIngredient),
    type: recipe.type,
    pattern: recipe.pattern !== undefined ? [...recipe.pattern] : undefined,
    key,
    leftover: recipe.leftover !== undefined ? encodeIngredient(recipe.leftover) : undefined,
    priority: recipe.priority,
    duration: recipe.duration,
    energy: recipe.energy,
    extensions: extensionsFromRecipe(recipe),
  };
}

/** Wire recipe → domain. */
export function decodeRecipe(wire: RecipeWireMsg): Recipe {
  const recipe: Recipe = {
    id: wire.id,
    stations: [...wire.stations],
    inputs: wire.inputs.map(decodeIngredient),
    outputs: wire.outputs.map(decodeIngredient),
  };
  if (wire.type !== undefined) recipe.type = wire.type;
  if (wire.pattern !== undefined) recipe.pattern = [...wire.pattern];
  if (wire.key !== undefined) {
    const key: Record<string, Ingredient> = {};
    for (const [symbol, ingredient] of wire.key) {
      key[symbol] = decodeIngredient(ingredient);
    }
    recipe.key = key;
  }
  if (wire.leftover !== undefined) recipe.leftover = decodeIngredient(wire.leftover);
  if (wire.priority !== undefined) recipe.priority = wire.priority;
  if (wire.duration !== undefined) recipe.duration = wire.duration;
  if (wire.energy !== undefined) recipe.energy = wire.energy;
  applyExtensions(recipe, wire.extensions);
  return recipe;
}

/** Domain match query → wire (`null` grid cells → `""`). */
export function encodeMatchQuery(query: MatchQuery): {
  station: string;
  grid?: string[];
  pattern?: string[];
  key?: Map<string, IngredientWireMsg>;
  inputs?: IngredientWireMsg[];
} {
  const out: {
    station: string;
    grid?: string[];
    pattern?: string[];
    key?: Map<string, IngredientWireMsg>;
    inputs?: IngredientWireMsg[];
  } = { station: query.station };
  if (query.grid !== undefined) out.grid = query.grid.map((cell) => (cell === null ? "" : cell));
  if (query.pattern !== undefined) out.pattern = [...query.pattern];
  if (query.key !== undefined) {
    const map = new Map<string, IngredientWireMsg>();
    for (const [symbol, ingredient] of Object.entries(query.key)) {
      map.set(symbol, encodeIngredient(ingredient));
    }
    out.key = map;
  }
  if (query.inputs !== undefined) out.inputs = query.inputs.map(encodeIngredient);
  return out;
}

/** Wire match query → domain. */
export function decodeMatchQuery(wire: {
  station: string;
  grid?: string[];
  pattern?: string[];
  key?: Map<string, IngredientWireMsg>;
  inputs?: IngredientWireMsg[];
}): MatchQuery {
  const query: MatchQuery = { station: wire.station };
  if (wire.grid !== undefined) query.grid = wire.grid.map((cell) => (cell.length === 0 ? null : cell));
  if (wire.pattern !== undefined) query.pattern = [...wire.pattern];
  if (wire.key !== undefined) {
    const key: Record<string, Ingredient> = {};
    for (const [symbol, ingredient] of wire.key) {
      key[symbol] = decodeIngredient(ingredient);
    }
    query.key = key;
  }
  if (wire.inputs !== undefined) query.inputs = wire.inputs.map(decodeIngredient);
  return query;
}

/** Domain match result → wire. */
export function encodeMatchResult(result: MatchResult): MatchResultWireMsg {
  return {
    outputs: result.outputs.map(encodeIngredient),
    leftover: result.leftover !== undefined ? encodeIngredient(result.leftover) : undefined,
    duration: result.duration,
    energy: result.energy,
    type: result.type,
    extensions:
      result.extra !== undefined && Object.keys(result.extra).length > 0
        ? JSON.stringify({ extra: result.extra })
        : undefined,
  };
}

/** Wire match result → domain. */
export function decodeMatchResult(wire: MatchResultWireMsg): MatchResult {
  const result: MatchResult = { outputs: wire.outputs.map(decodeIngredient) };
  if (wire.leftover !== undefined) result.leftover = decodeIngredient(wire.leftover);
  if (wire.duration !== undefined) result.duration = wire.duration;
  if (wire.energy !== undefined) result.energy = wire.energy;
  if (wire.type !== undefined) result.type = wire.type;
  if (wire.extensions !== undefined) {
    try {
      const bag = JSON.parse(wire.extensions) as unknown;
      if (typeof bag === "object" && bag !== null && !Array.isArray(bag)) {
        const extra = (bag as Record<string, unknown>).extra;
        if (typeof extra === "object" && extra !== null && !Array.isArray(extra)) {
          result.extra = extra as Record<string, unknown>;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return result;
}

/** Domain list entry leftover encode. */
export function encodeListEntry(entry: ListEntry): ListEntryWireMsg {
  return {
    id: entry.id,
    type: entry.type,
    stations: [...entry.stations],
    leftover: entry.leftover !== undefined ? encodeIngredient(entry.leftover) : undefined,
  };
}

/** Wire list entry → domain. */
export function decodeListEntry(wire: {
  id: string;
  type?: string;
  stations: string[];
  leftover?: IngredientWireMsg;
}): ListEntry {
  const entry: ListEntry = { id: wire.id, stations: [...wire.stations] };
  if (wire.type !== undefined) entry.type = wire.type;
  if (wire.leftover !== undefined) entry.leftover = decodeIngredient(wire.leftover);
  return entry;
}
