import { PROTO } from "mcbe-ipc";

/** Ingredient on the wire (shorthand strings become `{ item }`). */
export const IngredientWire = PROTO.Object({
  item: PROTO.Optional(PROTO.String),
  tag: PROTO.Optional(PROTO.String),
  fluid: PROTO.Optional(PROTO.String),
  gas: PROTO.Optional(PROTO.String),
  count: PROTO.Optional(PROTO.VarInt32),
  amount: PROTO.Optional(PROTO.VarInt32),
  slot: PROTO.Optional(PROTO.String),
  tags: PROTO.Optional(PROTO.Array(PROTO.String)),
});

/** Structured recipe core; open keys in `extensions` JSON. */
export const RecipeWire = PROTO.Object({
  id: PROTO.String,
  stations: PROTO.Array(PROTO.String),
  inputs: PROTO.Array(IngredientWire),
  outputs: PROTO.Array(IngredientWire),
  type: PROTO.Optional(PROTO.String),
  pattern: PROTO.Optional(PROTO.Array(PROTO.String)),
  key: PROTO.Optional(PROTO.Map(PROTO.String, IngredientWire)),
  leftover: PROTO.Optional(IngredientWire),
  priority: PROTO.Optional(PROTO.VarInt32),
  duration: PROTO.Optional(PROTO.VarInt32),
  energy: PROTO.Optional(PROTO.Float64),
  extensions: PROTO.Optional(PROTO.String),
});

/** IPC hello / ready body. */
export const Hello = PROTO.Object({
  schema: PROTO.Int32,
  minecraft: PROTO.Optional(PROTO.String),
});

/** `register` ask (empty `recipes` / `documents` = fingerprint ping). */
export const RegisterAsk = PROTO.Object({
  source: PROTO.Optional(PROTO.String),
  kind: PROTO.Optional(PROTO.String),
  fp: PROTO.Optional(PROTO.String),
  recipes: PROTO.Array(RecipeWire),
  documents: PROTO.Optional(PROTO.Array(PROTO.String)),
});

/** Generic ok reply. */
export const OkReply = PROTO.Object({
  ok: PROTO.Boolean,
  err: PROTO.Optional(PROTO.String),
});

/** `unregister` ask. */
export const UnregisterAsk = PROTO.Object({
  ids: PROTO.Array(PROTO.String),
});

/** Match / result ask. Empty grid cells are `""`. */
export const MatchQuery = PROTO.Object({
  station: PROTO.String,
  grid: PROTO.Optional(PROTO.Array(PROTO.String)),
  pattern: PROTO.Optional(PROTO.Array(PROTO.String)),
  key: PROTO.Optional(PROTO.Map(PROTO.String, IngredientWire)),
  inputs: PROTO.Optional(PROTO.Array(IngredientWire)),
});

/** Yield row (no recipe id). */
export const MatchResult = PROTO.Object({
  outputs: PROTO.Array(IngredientWire),
  leftover: PROTO.Optional(IngredientWire),
  duration: PROTO.Optional(PROTO.VarInt32),
  energy: PROTO.Optional(PROTO.Float64),
  type: PROTO.Optional(PROTO.String),
  extensions: PROTO.Optional(PROTO.String),
});

/** `match` reply. */
export const MatchReply = PROTO.Object({
  ids: PROTO.Optional(PROTO.Array(PROTO.String)),
});

/** `result` reply. */
export const ResultReply = PROTO.Object({
  results: PROTO.Optional(PROTO.Array(MatchResult)),
});

/** `get` ask. */
export const GetAsk = PROTO.Object({
  kind: PROTO.Optional(PROTO.String),
  id: PROTO.String,
});

/** `get` reply. */
export const GetReply = PROTO.Object({
  recipe: PROTO.Optional(RecipeWire),
  document: PROTO.Optional(PROTO.String),
});

/** Compact list row. */
export const ListEntry = PROTO.Object({
  id: PROTO.String,
  type: PROTO.Optional(PROTO.String),
  stations: PROTO.Array(PROTO.String),
  leftover: PROTO.Optional(IngredientWire),
});

/** `list` ask. */
export const ListFilter = PROTO.Object({
  kind: PROTO.Optional(PROTO.String),
  station: PROTO.Optional(PROTO.String),
  output: PROTO.Optional(PROTO.String),
  leftover: PROTO.Optional(PROTO.String),
  input: PROTO.Optional(PROTO.String),
  source: PROTO.Optional(PROTO.String),
  vanilla: PROTO.Optional(PROTO.Boolean),
  namespace: PROTO.Optional(PROTO.String),
  creator: PROTO.Optional(PROTO.String),
  displayName: PROTO.Optional(PROTO.String),
  domain: PROTO.Optional(PROTO.String),
  id: PROTO.Optional(PROTO.String),
  entity: PROTO.Optional(PROTO.String),
  block: PROTO.Optional(PROTO.String),
  tool: PROTO.Optional(PROTO.String),
  item: PROTO.Optional(PROTO.String),
  fluid: PROTO.Optional(PROTO.String),
  gas: PROTO.Optional(PROTO.String),
});

/** `subscribe` ask. */
export const SubscribeAsk = PROTO.Object({
  kinds: PROTO.Array(PROTO.String),
  source: PROTO.Optional(PROTO.String),
});

/** `updated` send. */
export const KindUpdated = PROTO.Object({
  kind: PROTO.String,
  source: PROTO.Optional(PROTO.String),
  dropped: PROTO.Optional(PROTO.Boolean),
});

/** `list` reply. */
export const ListReply = PROTO.Object({
  entries: PROTO.Array(ListEntry),
  documents: PROTO.Optional(PROTO.Array(PROTO.String)),
  sources: PROTO.Optional(PROTO.Array(PROTO.String)),
});
