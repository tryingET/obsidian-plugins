import type { ScenePatch } from "../model/patch.js"
import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { CommandContext } from "./context.js"

export interface RenameNodeInput {
  readonly elementId: string
  readonly nextName: string
}

export const planRenameNode = (
  context: CommandContext,
  input: RenameNodeInput,
): Result<ScenePatch, string> => {
  const element = context.indexes.byId.get(input.elementId)
  if (!element) {
    return err("Element to rename does not exist.")
  }

  const normalized = input.nextName.trim()
  if (!normalized) {
    return err("Name cannot be empty.")
  }

  return ok({
    elementPatches: [
      {
        id: element.id,
        set: {
          name: normalized,
        },
      },
    ],
  })
}
