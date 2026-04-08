import { withLmxGroupLabel } from "../model/lmxMetadata.js"
import type { ScenePatch } from "../model/patch.js"
import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { CommandContext } from "./context.js"
import { resolveExistingIds } from "./helpers.js"

export interface CreateGroupInput {
  readonly elementIds: readonly string[]
  readonly nameSeed?: string
}

export interface CreateGroupPlan {
  readonly groupId: string
  readonly patch: ScenePatch
}

const normalizeGroupLabel = (seed: string): string => {
  const compact = seed.trim().replaceAll(/\s+/g, " ")
  return compact.length > 0 ? compact : "Group"
}

const normalizeGroupSeed = (seed: string): string => {
  const compact = normalizeGroupLabel(seed).replaceAll(/\s+/g, "-")
  return compact.length > 0 ? compact : "Group"
}

const makeUniqueGroupId = (context: CommandContext, base: string): string => {
  const existing = new Set(context.indexes.elementsByGroupId.keys())
  if (!existing.has(base)) {
    return base
  }

  let index = 2
  while (existing.has(`${base}-${index}`)) {
    index += 1
  }

  return `${base}-${index}`
}

export const planCreateGroup = (
  context: CommandContext,
  input: CreateGroupInput,
): Result<CreateGroupPlan, string> => {
  const resolved = resolveExistingIds(context, input.elementIds)
  if (!resolved.ok) {
    return resolved
  }

  if (resolved.value.length < 2) {
    return err("Need at least two elements to create a group.")
  }

  const groupLabel = normalizeGroupLabel(input.nameSeed ?? "Group")
  const base = normalizeGroupSeed(groupLabel)
  const groupId = makeUniqueGroupId(context, base)

  const patch: ScenePatch = {
    elementPatches: resolved.value.map((id) => {
      const current = context.indexes.byId.get(id)
      const nextGroupIds = [...(current?.groupIds ?? [])]
      if (!nextGroupIds.includes(groupId)) {
        nextGroupIds.push(groupId)
      }

      return {
        id,
        set: {
          groupIds: nextGroupIds,
          customData: withLmxGroupLabel(current?.customData ?? {}, groupId, groupLabel),
        },
      }
    }),
    selectIds: resolved.value,
  }

  return ok({ groupId, patch })
}
