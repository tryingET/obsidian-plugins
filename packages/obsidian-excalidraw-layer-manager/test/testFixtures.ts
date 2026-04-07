import type { CommandContext } from "../src/commands/context.js"
import type { ElementDTO } from "../src/model/entities.js"
import { buildSceneIndexes } from "../src/model/indexes.js"
import { DEFAULT_SETTINGS } from "../src/model/settings.js"
import type { SceneSnapshot } from "../src/model/snapshot.js"

export const makeElement = (partial: Partial<ElementDTO> & { id: string }): ElementDTO => {
  const element: ElementDTO = {
    id: partial.id,
    type: partial.type ?? "rectangle",
    zIndex: partial.zIndex ?? 0,
    groupIds: partial.groupIds ?? [],
    frameId: partial.frameId ?? null,
    containerId: partial.containerId ?? null,
    opacity: partial.opacity ?? 100,
    locked: partial.locked ?? false,
    isDeleted: partial.isDeleted ?? false,
    customData: partial.customData ?? {},
  }

  if (typeof partial.name === "string") {
    element.name = partial.name
  }

  if (typeof partial.text === "string") {
    element.text = partial.text
  }

  return element
}

export const makeSnapshot = (elements: readonly ElementDTO[]): SceneSnapshot => ({
  version: 1,
  elements,
  selectedIds: new Set<string>(),
  settings: DEFAULT_SETTINGS,
})

export const makeCommandContext = (elements: readonly ElementDTO[]): CommandContext => {
  const snapshot = makeSnapshot(elements)
  return {
    snapshot,
    indexes: buildSceneIndexes(snapshot),
  }
}
