import type { ElementDTO } from "../../src/model/entities.js"
import { makeElement } from "../testFixtures.js"

export interface TreeReplaySnapshot {
  readonly name: string
  readonly elements: readonly ElementDTO[]
  readonly expandedNodeIds: readonly string[]
  readonly groupFreedraw: boolean
}

export interface TreeReplayTrace {
  readonly name: string
  readonly snapshots: readonly TreeReplaySnapshot[]
}

const frameNodeId = (id: string): string => `frame:${id}`
const groupNodeId = (path: string): string => `group:${path}`

const buildTraceScene = (size: number, step: number): ElementDTO[] => {
  const elements: ElementDTO[] = []

  let activeFrameId: string | null = null
  let lastContainerId: string | null = null

  for (let index = 0; index < size; index += 1) {
    if (index % 260 === 0) {
      activeFrameId = `frame-${Math.floor(index / 260)}`
      lastContainerId = null
      elements.push(
        makeElement({
          id: activeFrameId,
          type: "frame",
          zIndex: index,
        }),
      )
      continue
    }

    if ((index + step) % 10 === 0 && lastContainerId) {
      elements.push(
        makeElement({
          id: `text-${index}`,
          type: "text",
          zIndex: index,
          frameId: activeFrameId,
          containerId: lastContainerId,
        }),
      )
      continue
    }

    const outerGroupId =
      (index + step * 7) % 17 === 0 ? `outer-${Math.floor(index / 120) % 12}` : null
    const innerGroupId =
      outerGroupId && (index + step * 3) % 31 === 0 ? `inner-${Math.floor(index / 60) % 14}` : null

    let groupIds: readonly string[] = []
    if (innerGroupId && outerGroupId) {
      groupIds = [innerGroupId, outerGroupId]
    } else if (outerGroupId) {
      groupIds = [outerGroupId]
    }

    const type = index % 8 === 0 ? "freedraw" : index % 23 === 0 ? "ellipse" : "rectangle"
    const id = type === "freedraw" ? `stroke-${index}` : `shape-${index}`

    const frameId = (index + step) % 41 === 0 ? null : activeFrameId

    elements.push(
      makeElement({
        id,
        type,
        zIndex: index,
        frameId,
        groupIds,
      }),
    )

    if (type !== "freedraw") {
      lastContainerId = id
    }
  }

  return elements
}

const toGroupPath = (groupIds: readonly string[]): string | null => {
  if (groupIds.length < 2) {
    return null
  }

  const outer = groupIds[groupIds.length - 1]
  if (!outer) {
    return null
  }

  const innerPath = [...groupIds.slice(0, groupIds.length - 1)].reverse()
  return [outer, ...innerPath].join("/")
}

const deriveExpandedNodeIds = (elements: readonly ElementDTO[]): readonly string[] => {
  const expanded = new Set<string>()

  const frameIds = elements
    .filter((element) => element.type === "frame")
    .slice(0, 3)
    .map((frame) => frameNodeId(frame.id))
  for (const id of frameIds) {
    expanded.add(id)
  }

  for (const element of elements) {
    const outerGroupId = element.groupIds[element.groupIds.length - 1]
    if (outerGroupId && expanded.size < 16) {
      expanded.add(groupNodeId(outerGroupId))
    }

    const groupPath = toGroupPath(element.groupIds)
    if (groupPath && expanded.size < 24) {
      expanded.add(groupNodeId(groupPath))
    }

    if (expanded.size >= 24) {
      break
    }
  }

  return [...expanded]
}

const makeReplayTrace = (
  name: string,
  size: number,
  steps: readonly number[],
  toggledFreedrawSnapshots: ReadonlySet<number>,
): TreeReplayTrace => {
  const snapshots: TreeReplaySnapshot[] = steps.map((step, snapshotIndex) => {
    const elements = buildTraceScene(size, step)

    return {
      name: `${name}-snapshot-${snapshotIndex + 1}`,
      elements,
      expandedNodeIds: deriveExpandedNodeIds(elements),
      groupFreedraw: !toggledFreedrawSnapshots.has(snapshotIndex),
    }
  })

  return {
    name,
    snapshots,
  }
}

export const TREE_REPLAY_TRACES: readonly TreeReplayTrace[] = [
  makeReplayTrace("session-frame-heavy", 1800, [1, 2, 3, 4], new Set<number>([2])),
  makeReplayTrace("session-mixed-groups", 2000, [5, 6, 7], new Set<number>([1])),
]
