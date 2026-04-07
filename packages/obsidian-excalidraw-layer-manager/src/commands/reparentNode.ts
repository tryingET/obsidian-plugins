import { validateReparentInvariants } from "../domain/invariants.js"
import type { ScenePatch } from "../model/patch.js"
import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { CommandContext } from "./context.js"
import { resolveExistingIds } from "./helpers.js"

export interface ReparentNodeInput {
  readonly elementIds: readonly string[]
  readonly sourceGroupId: string | null
  readonly targetParentPath: readonly string[]
  readonly targetFrameId: string | null
}

const unique = (values: readonly string[]): string[] => {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue
    }

    seen.add(value)
    output.push(value)
  }

  return output
}

const buildReparentedGroupIds = (
  targetGroupIds: readonly string[],
  sourceGroupId: string | null,
  targetSuffix: readonly string[],
): readonly string[] => {
  if (!sourceGroupId) {
    return unique(targetSuffix)
  }

  const sourceIndex = targetGroupIds.lastIndexOf(sourceGroupId)
  if (sourceIndex < 0) {
    return unique([sourceGroupId, ...targetSuffix])
  }

  const innerPrefix = targetGroupIds.slice(0, sourceIndex)
  return unique([...innerPrefix, sourceGroupId, ...targetSuffix])
}

export const planReparentNode = (
  context: CommandContext,
  input: ReparentNodeInput,
): Result<ScenePatch, string> => {
  const resolved = resolveExistingIds(context, input.elementIds)
  if (!resolved.ok) {
    return resolved
  }

  const targets = resolved.value
    .map((id) => context.indexes.byId.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  if (targets.length === 0) {
    return err("No targets to reparent.")
  }

  if (input.sourceGroupId) {
    const sourceGroupId = input.sourceGroupId
    const everyTargetContainsSourceGroup = targets.every((target) =>
      target.groupIds.includes(sourceGroupId),
    )

    if (!everyTargetContainsSourceGroup) {
      return err("sourceGroupId must exist in every normalized target for reparent.")
    }
  }

  const sourceFrameId = targets[0]?.frameId ?? null
  const mixedFrames = targets.some((target) => target.frameId !== sourceFrameId)
  if (mixedFrames) {
    return err("Cannot reparent nodes spanning multiple source frames.")
  }

  const validation = validateReparentInvariants({
    sourceFrameId,
    targetFrameId: input.targetFrameId,
    sourceGroupId: input.sourceGroupId,
    targetParentPath: input.targetParentPath,
  })

  if (!validation.ok) {
    return validation
  }

  const targetSuffix = unique([...input.targetParentPath].filter((groupId) => !!groupId).reverse())

  return ok({
    elementPatches: targets.map((target) => ({
      id: target.id,
      set: {
        frameId: input.targetFrameId,
        groupIds: buildReparentedGroupIds(target.groupIds, input.sourceGroupId, targetSuffix),
      },
    })),
  })
}
