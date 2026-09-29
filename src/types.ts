/** Potion identity on a drink vessel (e.g. water bottle). */
export interface FluidPotionId {
  effectType: string;
  deliveryType: string;
}

/** One filled/empty container mapping on a fluid or gas document. */
export interface FluidVesselDoc {
  filled: string;
  empty: string;
  /** Integer base units (`BUCKET` / `BOTTLE` / `mb()`). */
  amount: number;
  potion?: FluidPotionId;
}

/** Catalog `fluid` document (`kind` is the I/O table: `liquid`). */
export interface FluidDocument extends RegistryDocument {
  id: string;
  kind: "liquid";
  vessels: FluidVesselDoc[];
  texture?: string;
  tags?: string[];
}

/** Catalog `gas` document. */
export interface GasDocument extends RegistryDocument {
  id: string;
  kind: "gas";
  vessels: FluidVesselDoc[];
  texture?: string;
  tags?: string[];
}

/** Object form of an ingredient when shorthand is not enough. */
export interface IngredientObject {
  item?: string;
  tag?: string;
  fluid?: string;
  gas?: string;
  /** Item stack count, or fluid/gas base units (not unrolled). */
  count?: number;
  amount?: number;
  slot?: string;
  /** Tags the query item has; ignored on stored recipes. */
  tags?: string[];
}

/** Item or tag ingredient: a type-id string, or an object with count/slot/tag. */
export type Ingredient = string | IngredientObject;

/** Generic catalog document: required `id`, leftover keys preserved. */
export interface RegistryDocument {
  id: string;
  [key: string]: unknown;
}

/** One catalog document. */
export interface Recipe {
  id: string;
  stations: string[];
  inputs: Ingredient[];
  outputs: Ingredient[];
  type?: string;
  pattern?: string[];
  key?: Record<string, Ingredient>;
  leftover?: Ingredient;
  priority?: number;
  duration?: number;
  energy?: number;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Compact list row. */
export interface ListEntry {
  id: string;
  type?: string;
  stations: string[];
  leftover?: Ingredient;
}

/** One drop row on a `loot` document. */
export interface LootEntry {
  item?: string;
  tag?: string;
  fluid?: string;
  gas?: string;
  count?: number;
  min?: number;
  max?: number;
  /** Percent 0–100; 100 = always. */
  chance?: number;
}

/** Harvest token for empty hand (`tools` on a loot document). */
export const LOOT_TOOL_NONE = "none";

/** Compact `loot` catalog document. */
export interface LootDocument extends RegistryDocument {
  id: string;
  entity?: string;
  block?: string;
  /** Harvest tokens: `none` for empty hand, otherwise item type ids. */
  tools?: string[];
  entries: LootEntry[];
}

/** Filters for `list`. */
export interface ListFilter {
  /** Catalog kind; omitted means `recipe`. */
  kind?: string;
  station?: string;
  output?: string;
  leftover?: string;
  /** Item, fluid, or gas id a recipe lists in `inputs`. */
  input?: string;
  /** Last-writer pack; overlay list of that source only. */
  source?: string;
  /** When `false`, overlay documents only (no vanilla / session-only). Default `true`. */
  vanilla?: boolean;
  /** Pack index: namespace field. */
  namespace?: string;
  /** Pack index: creator field. */
  creator?: string;
  /** Pack index: display name (colliding names all match). */
  displayName?: string;
  /** Tag-document list: `item` | `block` | `fluid` | `gas` | `entity`. */
  domain?: string;
  /** Tag membership list: tag id (with `kind: "tag"`). */
  id?: string;
  /** Loot index: entity type id. */
  entity?: string;
  /** Loot index: block type id. */
  block?: string;
  /** Loot index: harvest token (`none` or item type id). */
  tool?: string;
  /** Loot drop index: item id. */
  item?: string;
  /** Loot drop index: fluid id. */
  fluid?: string;
  /** Loot drop index: gas id. */
  gas?: string;
}

/** Overlay `list` options for one tracked kind (`kind` is filled by `track`). */
export type TrackFilter = Omit<ListFilter, "kind">;

/** Local documents inserted into the replica before overlay `list`. */
export interface TrackSeed {
  kind: string;
  documents: readonly RegistryDocument[];
}

/** Vanilla tag snapshots seeded into a tracked replica. */
export interface CatalogTagSeed {
  item?: Readonly<Record<string, readonly string[]>>;
  block?: Readonly<Record<string, readonly string[]>>;
}

/** `track` ask: watch kinds into a RAM catalog. No replica until `track`. */
export interface TrackAsk {
  kinds: string[];
  /** Ignore `updated` from this pack (this client's register source). */
  source?: string;
  /** Default overlay filter for every tracked kind (`vanilla: false` if omitted). */
  filter?: TrackFilter;
  /** Per-kind overlay filter; overrides {@link TrackAsk.filter}. */
  filters?: Record<string, TrackFilter>;
  seed?: readonly TrackSeed[];
  /** Item/block tag snapshots for replica membership / recipe `{ tag }` match. */
  tags?: CatalogTagSeed;
}
export interface SubscribeAsk {
  kinds: string[];
  source?: string;
}

/** Compact + overlay `list` reply. Overlay fills `documents` / `sources`. */
export interface CatalogList {
  entries: ListEntry[];
  documents: RegistryDocument[];
  sources: string[];
}

/** `updated` send: that `(source, kind)` changed, or a drop. */
export interface KindUpdated {
  kind: string;
  source?: string;
  dropped?: boolean;
}

/** Yield of a match — no recipe id. */
export interface MatchResult {
  outputs: Ingredient[];
  leftover?: Ingredient;
  duration?: number;
  energy?: number;
  extra?: Record<string, unknown>;
  type?: string;
}

/** Match / result ask. */
export interface MatchQuery {
  station: string;
  grid?: (string | null)[];
  pattern?: string[];
  key?: Record<string, Ingredient>;
  inputs?: Ingredient[];
}

/** IPC hello reply / ready payload fields. */
export interface HelloReply {
  schema: number;
  minecraft?: string;
}

/** Register ask over IPC. */
export interface RegisterAsk {
  recipes: Recipe[];
  source?: string;
  kind?: string;
  fp?: string;
}

/** Generic ok reply. */
export interface OkReply {
  ok: boolean;
  err?: string;
}
