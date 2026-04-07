import type { ScenePatch } from "../model/patch.js"
import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { CommandContext } from "./context.js"
import { normalizeTargetIds } from "./helpers.js"

export interface ReorderInput {
  readonly orderedElementIds: readonly string[]
}

export const planReorder = (
  context: CommandContext,
  input: ReorderInput,
): Result<ScenePatch, string> => {
  const orderedSubset = normalizeTargetIds(context, input.orderedElementIds)
  if (orderedSubset.length === 0) {
    return err("No valid element IDs for reorder.")
  }

  const subsetSet = new Set(orderedSubset)
  const remaining = context.snapshot.elements
    .map((element) => element.id)
    .filter((id) => !subsetSet.has(id))

  return ok({
    elementPatches: [],
    reorder: {
      orderedElementIds: [...remaining, ...orderedSubset],
    },
  })
}
