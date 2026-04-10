import {
  collectCanonicalTargetParentPathKeys,
  validateReparentInvariants,
} from "../domain/invariants.js"
import { buildLayerTree } from "../domain/treeBuilder.js"
import { type ScenePatch, emptyPatch } from "../model/patch.js"
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

const buildReparentedGroupIds = (
  targetGroupIds: readonly string[],
  sourceGroupId: string | null,
  targetSuffix: readonly string[],
): readonly string[] => {
  if (!sourceGroupId) {
    return [...targetSuffix]
  }

  const sourceIndex = targetGroupIds.lastIndexOf(sourceGroupId)
  if (sourceIndex < 0) {
    return [sourceGroupId, ...targetSuffix]
  }

  const innerPrefix = targetGroupIds.slice(0, sourceIndex)
  return [...innerPrefix, sourceGroupId, ...targetSuffix]
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

  if (targets.some((target) => target.type === "frame")) {
    return err("Frame elements cannot be structurally reparented.")
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

  const structuralTree = buildLayerTree(
    {
      elements: context.snapshot.elements,
      expandedNodeIds: new Set<string>(),
      groupFreedraw: context.snapshot.settings.groupFreedraw,
    },
    context.indexes,
  )

  const validation = validateReparentInvariants({
    sourceFrameId,
    targetFrameId: input.targetFrameId,
    sourceGroupId: input.sourceGroupId,
    targetParentPath: input.targetParentPath,
    canonicalTargetParentPathKeys: collectCanonicalTargetParentPathKeys(structuralTree),
    structuralTree,
  })

  if (!validation.ok) {
    return validation
  }

  const targetSuffix = [...input.targetParentPath].reverse()

  const elementPatches = targets.flatMap((target) => {
    const nextGroupIds = buildReparentedGroupIds(target.groupIds, input.sourceGroupId, targetSuffix)
    const frameChanged = target.frameId !== input.targetFrameId
    const groupIdsChanged =
      target.groupIds.length !== nextGroupIds.length ||
      target.groupIds.some((groupId, index) => groupId !== nextGroupIds[index])

    if (!frameChanged && !groupIdsChanged) {
      return []
    }

    return [
      {
        id: target.id,
        set: {
          frameId: input.targetFrameId,
          groupIds: nextGroupIds,
        },
      },
    ]
  })

  if (elementPatches.length === 0) {
    return ok(emptyPatch())
  }

  return ok({
    elementPatches,
  })
}
