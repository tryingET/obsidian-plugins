import type { SceneIndexes } from "../model/indexes.js"
import type { SceneSnapshot } from "../model/snapshot.js"

export interface CommandContext {
  readonly snapshot: SceneSnapshot
  readonly indexes: SceneIndexes
}
