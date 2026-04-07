import type { ScenePatch } from "../model/patch.js"
import { ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { CommandContext } from "./context.js"
import { resolveExistingIds } from "./helpers.js"

export interface DeleteNodeInput {
  readonly elementIds: readonly string[]
}

export const planDeleteNode = (
  context: CommandContext,
  input: DeleteNodeInput,
): Result<ScenePatch, string> => {
  const resolved = resolveExistingIds(context, input.elementIds)
  if (!resolved.ok) {
    return resolved
  }

  return ok({
    elementPatches: resolved.value.map((id) => ({
      id,
      set: {
        isDeleted: true,
      },
    })),
  })
}
