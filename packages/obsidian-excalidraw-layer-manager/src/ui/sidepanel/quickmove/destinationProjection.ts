import type { StructuralLayerNode } from "../../../model/tree.js"
import {
  type GroupReparentPreset,
  collectAllGroupReparentPresets,
  collectTopLevelGroupReparentPresets,
  makePresetKey,
  resolveNodeFrameId,
} from "./presetHelpers.js"
import type { LastQuickMoveDestination } from "./quickMovePersistenceService.js"

export interface SidepanelQuickMoveDestinationProjection {
  readonly topLevelPresets: readonly GroupReparentPreset[]
  readonly allDestinations: readonly GroupReparentPreset[]
  readonly destinationByKey: ReadonlyMap<string, GroupReparentPreset>
  readonly destinationPickerWasCapped: boolean
  readonly liveFrameIds: ReadonlySet<string>
  readonly frameLabelById: ReadonlyMap<string, string>
}

const getDestinationIdentity = (destination: LastQuickMoveDestination): string => {
  return destination.kind === "root"
    ? `root:${destination.targetFrameId ?? "null"}`
    : destination.preset.key
}

const collectLiveFrameProjection = (
  tree: readonly StructuralLayerNode[],
): {
  readonly liveFrameIds: ReadonlySet<string>
  readonly frameLabelById: ReadonlyMap<string, string>
} => {
  const liveFrameIds = new Set<string>()
  const frameLabelById = new Map<string, string>()
  const stack = [...tree]

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) {
      continue
    }

    const frameId = resolveNodeFrameId(node)
    if (node.type === "frame" && frameId) {
      liveFrameIds.add(frameId)
      frameLabelById.set(frameId, node.label)
    }

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]
      if (child) {
        stack.push(child)
      }
    }
  }

  return {
    liveFrameIds,
    frameLabelById,
  }
}

const isLiveRootDestination = (
  destination: Extract<LastQuickMoveDestination, { readonly kind: "root" }>,
  liveFrameIds: ReadonlySet<string>,
): boolean => {
  return !destination.targetFrameId || liveFrameIds.has(destination.targetFrameId)
}

export const buildSidepanelQuickMoveDestinationProjection = (
  tree: readonly StructuralLayerNode[],
  quickPresetTotalMax: number,
  allDestinationTotalMax: number,
): SidepanelQuickMoveDestinationProjection => {
  const allKnownDestinations = collectAllGroupReparentPresets(tree)
  const frameProjection = collectLiveFrameProjection(tree)

  return {
    topLevelPresets: collectTopLevelGroupReparentPresets(tree, quickPresetTotalMax),
    allDestinations: allKnownDestinations.slice(0, allDestinationTotalMax),
    destinationByKey: new Map(allKnownDestinations.map((preset) => [preset.key, preset])),
    destinationPickerWasCapped: allKnownDestinations.length > allDestinationTotalMax,
    liveFrameIds: frameProjection.liveFrameIds,
    frameLabelById: frameProjection.frameLabelById,
  }
}

export const projectQuickMoveDestination = (
  destination: LastQuickMoveDestination | null,
  destinationByKey: ReadonlyMap<string, GroupReparentPreset>,
  liveFrameIds: ReadonlySet<string>,
): LastQuickMoveDestination | null => {
  if (!destination) {
    return null
  }

  if (destination.kind === "root") {
    return isLiveRootDestination(destination, liveFrameIds) ? destination : null
  }

  const livePreset = destinationByKey.get(destination.preset.key)
  if (!livePreset) {
    return null
  }

  return {
    kind: "preset",
    preset: livePreset,
  }
}

export const projectQuickMoveDestinations = (
  destinations: readonly LastQuickMoveDestination[],
  destinationByKey: ReadonlyMap<string, GroupReparentPreset>,
  liveFrameIds: ReadonlySet<string>,
): readonly LastQuickMoveDestination[] => {
  const projected: LastQuickMoveDestination[] = []
  const seenDestinationIds = new Set<string>()

  for (const destination of destinations) {
    const nextDestination = projectQuickMoveDestination(destination, destinationByKey, liveFrameIds)
    if (!nextDestination) {
      continue
    }

    const destinationIdentity = getDestinationIdentity(nextDestination)
    if (seenDestinationIds.has(destinationIdentity)) {
      continue
    }

    seenDestinationIds.add(destinationIdentity)
    projected.push(nextDestination)
  }

  return projected
}

export const resolveProjectedQuickMovePreset = (
  targetParentPath: readonly string[],
  targetFrameId: string | null,
  destinationByKey: ReadonlyMap<string, GroupReparentPreset>,
): GroupReparentPreset | null => {
  return destinationByKey.get(makePresetKey(targetParentPath, targetFrameId)) ?? null
}
