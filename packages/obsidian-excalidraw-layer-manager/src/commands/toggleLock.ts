import type { ScenePatch } from "../model/patch.js"
import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { CommandContext } from "./context.js"
import { resolveExistingIds } from "./helpers.js"

export interface ToggleLockInput {
  readonly elementIds: readonly string[]
}

export const planToggleLock = (
  context: CommandContext,
  input: ToggleLockInput,
): Result<ScenePatch, string> => {
  const resolved = resolveExistingIds(context, input.elementIds)
  if (!resolved.ok) {
    return resolved
  }

  const targets = resolved.value
    .map((id) => context.indexes.byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  if (targets.length === 0) {
    return err("No toggle lock targets resolved.")
  }

  const allLocked = targets.every((target) => target.locked)

  return ok({
    elementPatches: targets.map((target) => ({
      id: target.id,
      set: {
        locked: !allLocked,
      },
    })),
  })
}
