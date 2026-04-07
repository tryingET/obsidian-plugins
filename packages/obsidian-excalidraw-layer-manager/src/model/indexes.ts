import type { ElementDTO } from "./entities.js"
import type { SceneSnapshot } from "./snapshot.js"

export interface SceneIndexes {
  readonly byId: ReadonlyMap<string, ElementDTO>
  readonly boundTextByContainer: ReadonlyMap<string, readonly ElementDTO[]>
  readonly elementsByFrameId: ReadonlyMap<string | null, readonly ElementDTO[]>
  readonly elementsByGroupId: ReadonlyMap<string, readonly ElementDTO[]>
}

const pushMapArray = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const current = map.get(key)
  if (current) {
    current.push(value)
    return
  }
  map.set(key, [value])
}

const isBoundText = (element: ElementDTO): boolean => {
  return element.type === "text" && typeof element.containerId === "string"
}

export const buildSceneIndexes = (snapshot: SceneSnapshot): SceneIndexes => {
  const byId = new Map<string, ElementDTO>()
  const boundTextByContainer = new Map<string, ElementDTO[]>()
  const elementsByFrameId = new Map<string | null, ElementDTO[]>()
  const elementsByGroupId = new Map<string, ElementDTO[]>()

  for (const element of snapshot.elements) {
    byId.set(element.id, element)

    if (isBoundText(element) && element.containerId) {
      pushMapArray(boundTextByContainer, element.containerId, element)
    }

    pushMapArray(elementsByFrameId, element.frameId, element)

    for (const groupId of element.groupIds) {
      pushMapArray(elementsByGroupId, groupId, element)
    }
  }

  return {
    byId,
    boundTextByContainer,
    elementsByFrameId,
    elementsByGroupId,
  }
}
