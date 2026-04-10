import type { ScenePatch } from "../model/patch.js"
import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { CommandContext } from "./context.js"
import { resolveExistingIds } from "./helpers.js"

export interface ToggleVisibilityInput {
  readonly elementIds: readonly string[]
}

export const planToggleVisibility = (
  context: CommandContext,
  input: ToggleVisibilityInput,
): Result<ScenePatch, string> => {
  const resolved = resolveExistingIds(context, input.elementIds)
  if (!resolved.ok) {
    return resolved
  }

  const targets = resolved.value
    .map((id) => context.indexes.byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  if (targets.length === 0) {
    return err("No toggle visibility targets resolved.")
  }

  const anyHidden = targets.some((target) => target.opacity <= 0)

  return ok({
    elementPatches: targets.flatMap((target) => {
      if (anyHidden) {
        if (target.opacity > 0) {
          return []
        }

        const originalOpacity = target.customData.originalOpacity
        const restoreOpacity =
          typeof originalOpacity === "number" && originalOpacity > 0 ? originalOpacity : 100

        const { originalOpacity: _, ...cleanedCustomData } = target.customData

        return [
          {
            id: target.id,
            set: {
              opacity: restoreOpacity,
              customData: cleanedCustomData,
            },
          },
        ]
      }

      return [
        {
          id: target.id,
          set: {
            opacity: 0,
            customData: {
              ...target.customData,
              originalOpacity: target.opacity,
            },
          },
        },
      ]
    }),
  })
}
