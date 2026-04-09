import type { StructuralLayerNode } from "../../../model/tree.js"
import {
  type GroupReparentPreset,
  type SharedFrameResolution,
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

const describeDestinationFrame = (
  targetFrameId: string | null,
  frameLabelById: ReadonlyMap<string, string>,
): string => {
  if (!targetFrameId) {
    return "canvas"
  }

  return `frame ${frameLabelById.get(targetFrameId) ?? targetFrameId}`
}

const describeCanonicalPath = (preset: GroupReparentPreset): string => {
  return preset.targetParentPath.join("/")
}

const disambiguatePresetLabels = (
  presets: readonly GroupReparentPreset[],
  frameLabelById: ReadonlyMap<string, string>,
): readonly GroupReparentPreset[] => {
  const labelsByKey = new Map(presets.map((preset) => [preset.key, preset.label]))
  const qualifierResolvers = [
    (preset: GroupReparentPreset) => describeDestinationFrame(preset.targetFrameId, frameLabelById),
    (preset: GroupReparentPreset) => describeCanonicalPath(preset),
    (preset: GroupReparentPreset) => preset.key,
  ] as const

  for (const resolveQualifier of qualifierResolvers) {
    const presetsByLabel = new Map<string, GroupReparentPreset[]>()

    for (const preset of presets) {
      const currentLabel = labelsByKey.get(preset.key) ?? preset.label
      const existing = presetsByLabel.get(currentLabel)
      if (existing) {
        existing.push(preset)
        continue
      }

      presetsByLabel.set(currentLabel, [preset])
    }

    const duplicateEntries = [...presetsByLabel.entries()].filter(
      ([, entries]) => entries.length > 1,
    )
    if (duplicateEntries.length === 0) {
      break
    }

    for (const [, duplicatePresets] of duplicateEntries) {
      for (const preset of duplicatePresets) {
        const currentLabel = labelsByKey.get(preset.key) ?? preset.label
        labelsByKey.set(preset.key, `${currentLabel} — ${resolveQualifier(preset)}`)
      }
    }
  }

  return presets.map((preset) => ({
    ...preset,
    label: labelsByKey.get(preset.key) ?? preset.label,
  }))
}

const stableRankByCompatibility = <T>(
  values: readonly T[],
  isCompatible: (value: T) => boolean,
): readonly T[] => {
  return values
    .map((value, index) => ({
      value,
      index,
      compatibilityRank: isCompatible(value) ? 0 : 1,
    }))
    .sort((left, right) => {
      if (left.compatibilityRank !== right.compatibilityRank) {
        return left.compatibilityRank - right.compatibilityRank
      }

      return left.index - right.index
    })
    .map((entry) => entry.value)
}

export const isPresetFrameCompatible = (
  frameResolution: SharedFrameResolution,
  preset: GroupReparentPreset,
): boolean => {
  return frameResolution.ok && frameResolution.frameId === preset.targetFrameId
}

export const isRootFrameCompatible = (
  frameResolution: SharedFrameResolution,
  destination: Extract<LastQuickMoveDestination, { readonly kind: "root" }>,
): boolean => {
  return frameResolution.ok && frameResolution.frameId === destination.targetFrameId
}

export const isDestinationFrameCompatible = (
  frameResolution: SharedFrameResolution,
  destination: LastQuickMoveDestination,
): boolean => {
  if (destination.kind === "root") {
    return isRootFrameCompatible(frameResolution, destination)
  }

  return isPresetFrameCompatible(frameResolution, destination.preset)
}

export const rankGroupReparentPresetsByCompatibility = (
  presets: readonly GroupReparentPreset[],
  frameResolution: SharedFrameResolution,
): readonly GroupReparentPreset[] => {
  if (!frameResolution.ok) {
    return [...presets]
  }

  return stableRankByCompatibility(presets, (preset) =>
    isPresetFrameCompatible(frameResolution, preset),
  )
}

export const rankQuickMoveDestinationsByCompatibility = (
  destinations: readonly LastQuickMoveDestination[],
  frameResolution: SharedFrameResolution,
): readonly LastQuickMoveDestination[] => {
  if (!frameResolution.ok) {
    return [...destinations]
  }

  return stableRankByCompatibility(destinations, (destination) =>
    isDestinationFrameCompatible(frameResolution, destination),
  )
}

export const buildSidepanelQuickMoveDestinationProjection = (
  tree: readonly StructuralLayerNode[],
  quickPresetTotalMax: number,
  allDestinationTotalMax: number,
): SidepanelQuickMoveDestinationProjection => {
  const frameProjection = collectLiveFrameProjection(tree)
  const allKnownDestinations = disambiguatePresetLabels(
    collectAllGroupReparentPresets(tree),
    frameProjection.frameLabelById,
  )
  const destinationByKey = new Map(allKnownDestinations.map((preset) => [preset.key, preset]))
  const topLevelPresets = collectTopLevelGroupReparentPresets(tree, quickPresetTotalMax).map(
    (preset) => destinationByKey.get(preset.key) ?? preset,
  )

  return {
    topLevelPresets,
    allDestinations: allKnownDestinations.slice(0, allDestinationTotalMax),
    destinationByKey,
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
