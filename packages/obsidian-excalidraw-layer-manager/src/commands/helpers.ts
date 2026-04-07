import type { ElementDTO } from "../model/entities.js"
import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { CommandContext } from "./context.js"

const isBoundTextWithExistingContainer = (
  element: ElementDTO,
  context: CommandContext,
): element is ElementDTO & { containerId: string } => {
  return (
    element.type === "text" &&
    !!element.containerId &&
    context.indexes.byId.has(element.containerId)
  )
}

const appendIfExisting = (
  context: CommandContext,
  id: string,
  seen: Set<string>,
  output: string[],
): void => {
  if (seen.has(id) || !context.indexes.byId.has(id)) {
    return
  }

  seen.add(id)
  output.push(id)
}

const appendContainerClosure = (
  context: CommandContext,
  containerId: string,
  seen: Set<string>,
  output: string[],
): void => {
  appendIfExisting(context, containerId, seen, output)

  const boundTexts = context.indexes.boundTextByContainer.get(containerId) ?? []
  for (const boundText of boundTexts) {
    appendIfExisting(context, boundText.id, seen, output)
  }
}

const stableUniqueExistingInput = (context: CommandContext, ids: readonly string[]): string[] => {
  const seen = new Set<string>()
  const output: string[] = []

  for (const id of ids) {
    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    if (context.indexes.byId.has(id)) {
      output.push(id)
    }
  }

  return output
}

export const normalizeTargetIds = (
  context: CommandContext,
  elementIds: readonly string[],
): readonly string[] => {
  const requested = stableUniqueExistingInput(context, elementIds)
  const normalized: string[] = []
  const seenNormalized = new Set<string>()

  for (const id of requested) {
    const element = context.indexes.byId.get(id)
    if (!element) {
      continue
    }

    if (isBoundTextWithExistingContainer(element, context)) {
      appendContainerClosure(context, element.containerId, seenNormalized, normalized)
      continue
    }

    appendIfExisting(context, id, seenNormalized, normalized)
    appendContainerClosure(context, id, seenNormalized, normalized)
  }

  return normalized
}

export const resolveExistingIds = (
  context: CommandContext,
  elementIds: readonly string[],
): Result<readonly string[], string> => {
  const resolved = normalizeTargetIds(context, elementIds)

  if (resolved.length === 0) {
    return err("No existing elements found for command.")
  }

  return ok(resolved)
}
