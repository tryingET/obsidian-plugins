import { type LayerNode, resolveFrameRowElementId } from "../../../model/tree.js"

export interface SharedFrameResolution {
  readonly ok: boolean
  readonly frameId: string | null
}

export interface GroupReparentPreset {
  readonly key: string
  readonly label: string
  readonly targetParentPath: readonly string[]
  readonly targetFrameId: string | null
}

export const resolveNodeFrameId = (node: LayerNode): string | null => {
  return resolveFrameRowElementId(node) ?? node.frameId ?? null
}

export const resolveSharedFrame = (nodes: readonly LayerNode[]): SharedFrameResolution => {
  let frameId: string | null | undefined

  for (const node of nodes) {
    const nodeFrameId = resolveNodeFrameId(node)
    if (frameId === undefined) {
      frameId = nodeFrameId
      continue
    }

    if (frameId !== nodeFrameId) {
      return {
        ok: false,
        frameId: null,
      }
    }
  }

  return {
    ok: true,
    frameId: frameId ?? null,
  }
}

export const truncateLabel = (label: string, maxLength: number): string => {
  if (label.length <= maxLength) {
    return label
  }

  return `${label.slice(0, maxLength - 1)}…`
}

export const makePresetOptionLabel = (path: readonly string[]): string => {
  if (path.length === 0) {
    return "Root"
  }

  return `Inside ${path.join(" › ")}`
}

export const makePresetLabel = (path: readonly string[]): string => {
  const full = makePresetOptionLabel(path)
  if (full.length <= 28) {
    return full
  }

  if (path.length <= 1) {
    return `${full.slice(0, 27)}…`
  }

  const tail = path.slice(-2).join(" › ")
  const compact = `Inside … › ${tail}`
  if (compact.length <= 28) {
    return compact
  }

  return `${compact.slice(0, 27)}…`
}

export const makePresetKey = (path: readonly string[], targetFrameId: string | null): string => {
  return `${targetFrameId ?? "null"}:${path.join("/")}`
}

const collectGroupReparentPresets = (
  tree: readonly LayerNode[],
  maxCount: number,
  includeNestedGroups: boolean,
): readonly GroupReparentPreset[] => {
  const presets: GroupReparentPreset[] = []
  const seenKeys = new Set<string>()

  const appendPreset = (
    path: readonly string[],
    labelPath: readonly string[],
    targetFrameId: string | null,
  ): boolean => {
    const key = makePresetKey(path, targetFrameId)
    if (seenKeys.has(key)) {
      return false
    }

    seenKeys.add(key)
    presets.push({
      key,
      label: makePresetOptionLabel(labelPath),
      targetParentPath: path,
      targetFrameId,
    })

    return true
  }

  const walk = (
    nodes: readonly LayerNode[],
    parentPath: readonly string[],
    parentLabelPath: readonly string[],
    groupAncestorDepth: number,
  ): boolean => {
    for (const node of nodes) {
      if (presets.length >= maxCount) {
        return true
      }

      let nextPath = parentPath
      let nextLabelPath = parentLabelPath
      let nextGroupAncestorDepth = groupAncestorDepth

      if (node.type === "group" && node.groupId) {
        nextPath = [...parentPath, node.groupId]
        nextLabelPath = [...parentLabelPath, node.label]

        if (includeNestedGroups || groupAncestorDepth === 0) {
          appendPreset(nextPath, nextLabelPath, node.frameId ?? null)
          if (presets.length >= maxCount) {
            return true
          }
        }

        nextGroupAncestorDepth = groupAncestorDepth + 1
      }

      if (node.children.length > 0) {
        const finished = walk(node.children, nextPath, nextLabelPath, nextGroupAncestorDepth)
        if (finished) {
          return true
        }
      }
    }

    return false
  }

  walk(tree, [], [], 0)
  return presets
}

export const collectTopLevelGroupReparentPresets = (
  tree: readonly LayerNode[],
  maxCount = Number.MAX_SAFE_INTEGER,
): readonly GroupReparentPreset[] => {
  return collectGroupReparentPresets(tree, maxCount, false)
}

export const collectAllGroupReparentPresets = (
  tree: readonly LayerNode[],
  maxCount = Number.MAX_SAFE_INTEGER,
): readonly GroupReparentPreset[] => {
  return collectGroupReparentPresets(tree, maxCount, true)
}
