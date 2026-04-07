import { withLmxElementLabel, withLmxGroupLabel } from "../model/lmxMetadata.js"
import type { ScenePatch } from "../model/patch.js"
import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { CommandContext } from "./context.js"

export type RenameNodeInput =
  | {
      readonly elementId: string
      readonly nextName: string
      readonly groupId?: never
    }
  | {
      readonly groupId: string
      readonly nextName: string
      readonly elementId?: never
    }

const normalizeRenameValue = (value: string): Result<string, string> => {
  const normalized = value.trim()
  if (!normalized) {
    return err("Name cannot be empty.")
  }

  return ok(normalized)
}

const planElementRename = (
  context: CommandContext,
  elementId: string,
  normalizedName: string,
): Result<ScenePatch, string> => {
  const element = context.indexes.byId.get(elementId)
  if (!element) {
    return err("Element to rename does not exist.")
  }

  return ok({
    elementPatches: [
      {
        id: element.id,
        set: {
          customData: withLmxElementLabel(element.customData, normalizedName),
          name: normalizedName,
        },
      },
    ],
  })
}

const planGroupRename = (
  context: CommandContext,
  groupId: string,
  normalizedName: string,
): Result<ScenePatch, string> => {
  const groupMembers = context.indexes.elementsByGroupId.get(groupId) ?? []
  if (groupMembers.length === 0) {
    return err("Group to rename does not exist.")
  }

  return ok({
    elementPatches: groupMembers.map((member) => ({
      id: member.id,
      set: {
        customData: withLmxGroupLabel(member.customData, groupId, normalizedName),
      },
    })),
  })
}

export const planRenameNode = (
  context: CommandContext,
  input: RenameNodeInput,
): Result<ScenePatch, string> => {
  const normalized = normalizeRenameValue(input.nextName)
  if (!normalized.ok) {
    return normalized
  }

  if ("groupId" in input) {
    return planGroupRename(context, input.groupId, normalized.value)
  }

  return planElementRename(context, input.elementId, normalized.value)
}
