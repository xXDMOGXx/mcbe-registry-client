# @mcbe-registry/client

## 2.0.0

### Major Changes

- bb31ed6: Schema 5: overlay kinds travel as per-kind PROTO objects (not JSON strings). Loot `chance` is percent 0–100 (`100` = always). Schema-4 clients and hosts no longer match.

### Minor Changes

- 8ecbc82: Register template and `registerFilledKinds` for optional host publish; UUID-depend on the host only if the addon cannot function without the catalog.

## 1.0.0

### Major Changes

- Schema 4 client for **Bedrock Registry** (`bedrockregistry.*`). `add` / `register` per kind, fingerprint ping, recipe `match` / `result`, fluids, tags, loot. Does not speak schema-3 `reciperegistry.*`.
