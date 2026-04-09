import { buildLayerTree } from "../domain/treeBuilder.js"
import { type ScenePatch, emptyPatch } from "../model/patch.js"
import { err, ok } from "../model/result.js"
import type { Result } from "../model/result.js"
import type { LayerNode } from "../model/tree.js"
import type { CommandContext } from "./context.js"
import { normalizeTargetIds } from "./helpers.js"

export type ReorderMode = "forward" | "backward" | "front" | "back"
export type ReorderPlacement = "before" | "after"

export interface ReorderInput {
  readonly orderedElementIds: readonly string[]
  readonly mode?: ReorderMode
  readonly anchorNodeId?: string
  readonly placement?: ReorderPlacement
}

interface SelectionBlock {
  readonly nodeId: string
  readonly scopeKey: string
}

const ROOT_SCOPE_KEY = "__root__"
const REORDER_MODES = ["forward", "backward", "front", "back"] as const
const REORDER_PLACEMENTS = ["before", "after"] as const

const isReorderMode = (value: string): value is ReorderMode => {
  return REORDER_MODES.includes(value as ReorderMode)
}

const isReorderPlacement = (value: string): value is ReorderPlacement => {
  return REORDER_PLACEMENTS.includes(value as ReorderPlacement)
}

const haveSameIdsInSameOrder = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

const haveSameNodeOrder = (left: readonly LayerNode[], right: readonly LayerNode[]): boolean => {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.id !== right[index]?.id) {
      return false
    }
  }

  return true
}

const buildSceneIndexById = (context: CommandContext): ReadonlyMap<string, number> => {
  const indexById = new Map<string, number>()

  context.snapshot.elements.forEach((element, index) => {
    indexById.set(element.id, index)
  })

  return indexById
}

const orderElementIdsByScene = (
  ids: readonly string[],
  sceneIndexById: ReadonlyMap<string, number>,
): readonly string[] => {
  return [...ids].sort((left, right) => {
    const leftIndex = sceneIndexById.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = sceneIndexById.get(right) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })
}

const buildScopeChildrenMap = (
  nodes: readonly LayerNode[],
  scopeKey: string,
  scopeChildrenByKey: Map<string, readonly LayerNode[]>,
): void => {
  scopeChildrenByKey.set(scopeKey, nodes)

  for (const node of nodes) {
    if (node.children.length === 0) {
      continue
    }

    buildScopeChildrenMap(node.children, node.id, scopeChildrenByKey)
  }
}

const buildNodeScopeIndex = (
  nodes: readonly LayerNode[],
  scopeKey: string,
  nodeScopeById: Map<string, string>,
): void => {
  for (const node of nodes) {
    nodeScopeById.set(node.id, scopeKey)

    if (node.children.length === 0) {
      continue
    }

    buildNodeScopeIndex(node.children, node.id, nodeScopeById)
  }
}

const isNodeFullySelected = (node: LayerNode, selectedIds: ReadonlySet<string>): boolean => {
  if (node.elementIds.length === 0) {
    return false
  }

  return node.elementIds.every((elementId) => selectedIds.has(elementId))
}

const hasSelectedLeafContent = (node: LayerNode, selectedIds: ReadonlySet<string>): boolean => {
  return node.elementIds.some((elementId) => selectedIds.has(elementId))
}

const collectSelectedBlocks = (
  nodes: readonly LayerNode[],
  selectedIds: ReadonlySet<string>,
  scopeKey: string,
): readonly SelectionBlock[] => {
  const blocks: SelectionBlock[] = []

  for (const node of nodes) {
    if (isNodeFullySelected(node, selectedIds)) {
      blocks.push({
        nodeId: node.id,
        scopeKey,
      })
      continue
    }

    if (node.children.length > 0) {
      blocks.push(...collectSelectedBlocks(node.children, selectedIds, node.id))
      continue
    }

    if (hasSelectedLeafContent(node, selectedIds)) {
      blocks.push({
        nodeId: node.id,
        scopeKey,
      })
    }
  }

  return blocks
}

const moveSelectedTowardFront = (
  children: readonly LayerNode[],
  selectedNodeIds: ReadonlySet<string>,
): readonly LayerNode[] => {
  const reordered = [...children]

  for (let index = 1; index < reordered.length; index += 1) {
    const current = reordered[index]
    const previous = reordered[index - 1]

    if (!current || !previous) {
      continue
    }

    if (!selectedNodeIds.has(current.id) || selectedNodeIds.has(previous.id)) {
      continue
    }

    reordered[index - 1] = current
    reordered[index] = previous
  }

  return reordered
}

const moveSelectedTowardBack = (
  children: readonly LayerNode[],
  selectedNodeIds: ReadonlySet<string>,
): readonly LayerNode[] => {
  const reordered = [...children]

  for (let index = reordered.length - 2; index >= 0; index -= 1) {
    const current = reordered[index]
    const next = reordered[index + 1]

    if (!current || !next) {
      continue
    }

    if (!selectedNodeIds.has(current.id) || selectedNodeIds.has(next.id)) {
      continue
    }

    reordered[index] = next
    reordered[index + 1] = current
  }

  return reordered
}

const reorderScopeChildren = (
  children: readonly LayerNode[],
  selectedNodeIds: ReadonlySet<string>,
  mode: ReorderMode,
): readonly LayerNode[] => {
  const selectedChildren = children.filter((child) => selectedNodeIds.has(child.id))
  if (selectedChildren.length === 0) {
    return children
  }

  if (mode === "front") {
    const remaining = children.filter((child) => !selectedNodeIds.has(child.id))
    return [...selectedChildren, ...remaining]
  }

  if (mode === "back") {
    const remaining = children.filter((child) => !selectedNodeIds.has(child.id))
    return [...remaining, ...selectedChildren]
  }

  if (mode === "forward") {
    return moveSelectedTowardFront(children, selectedNodeIds)
  }

  return moveSelectedTowardBack(children, selectedNodeIds)
}

const reorderScopeChildrenRelativeToAnchor = (
  children: readonly LayerNode[],
  selectedNodeIds: ReadonlySet<string>,
  anchorNodeId: string,
  placement: ReorderPlacement,
): Result<readonly LayerNode[], string> => {
  if (selectedNodeIds.has(anchorNodeId)) {
    return err("Relative reorder target must not be one of the dragged rows.")
  }

  const selectedChildren = children.filter((child) => selectedNodeIds.has(child.id))
  if (selectedChildren.length === 0) {
    return err("Relative reorder could not resolve the dragged rows inside the target scope.")
  }

  const remainingChildren = children.filter((child) => !selectedNodeIds.has(child.id))
  const anchorIndex = remainingChildren.findIndex((child) => child.id === anchorNodeId)
  if (anchorIndex < 0) {
    return err("Relative reorder target is no longer a sibling in the dragged row scope.")
  }

  const insertIndex = placement === "before" ? anchorIndex : anchorIndex + 1

  return ok([
    ...remainingChildren.slice(0, insertIndex),
    ...selectedChildren,
    ...remainingChildren.slice(insertIndex),
  ])
}

const flattenScopeToSceneOrder = (
  scopeKey: string,
  scopeChildrenByKey: ReadonlyMap<string, readonly LayerNode[]>,
  reorderedChildrenByScope: ReadonlyMap<string, readonly LayerNode[]>,
  sceneIndexById: ReadonlyMap<string, number>,
): readonly string[] => {
  const children = reorderedChildrenByScope.get(scopeKey) ?? scopeChildrenByKey.get(scopeKey) ?? []
  const orderedIds: string[] = []

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index]
    if (!child) {
      continue
    }

    orderedIds.push(
      ...flattenNodeToSceneOrder(
        child,
        scopeChildrenByKey,
        reorderedChildrenByScope,
        sceneIndexById,
      ),
    )
  }

  return orderedIds
}

const flattenNodeToSceneOrder = (
  node: LayerNode,
  scopeChildrenByKey: ReadonlyMap<string, readonly LayerNode[]>,
  reorderedChildrenByScope: ReadonlyMap<string, readonly LayerNode[]>,
  sceneIndexById: ReadonlyMap<string, number>,
): readonly string[] => {
  if (node.type === "frame") {
    return [
      node.primaryElementId,
      ...flattenScopeToSceneOrder(
        node.id,
        scopeChildrenByKey,
        reorderedChildrenByScope,
        sceneIndexById,
      ),
    ]
  }

  if (node.children.length > 0) {
    return flattenScopeToSceneOrder(
      node.id,
      scopeChildrenByKey,
      reorderedChildrenByScope,
      sceneIndexById,
    )
  }

  return orderElementIdsByScene(node.elementIds, sceneIndexById)
}

const isFullPermutation = (currentIds: readonly string[], nextIds: readonly string[]): boolean => {
  if (currentIds.length !== nextIds.length) {
    return false
  }

  const seen = new Set(nextIds)
  if (seen.size !== currentIds.length) {
    return false
  }

  return currentIds.every((id) => seen.has(id))
}

export const planReorder = (
  context: CommandContext,
  input: ReorderInput,
): Result<ScenePatch, string> => {
  const targetIds = normalizeTargetIds(context, input.orderedElementIds)
  if (targetIds.length === 0) {
    return err("No valid element IDs for reorder.")
  }

  const hasAnchorTarget = typeof input.anchorNodeId === "string" && input.anchorNodeId.length > 0
  const requestedMode = input.mode ?? "front"
  if (!hasAnchorTarget && !isReorderMode(requestedMode)) {
    return err(`Unknown reorder mode: ${requestedMode}.`)
  }

  const requestedPlacement = input.placement ?? "before"
  if (hasAnchorTarget && !isReorderPlacement(requestedPlacement)) {
    return err(`Unknown reorder placement: ${requestedPlacement}.`)
  }

  const selectedIds = new Set(targetIds)
  const sceneIndexById = buildSceneIndexById(context)
  const currentSceneOrder = context.snapshot.elements.map((element) => element.id)
  const tree = buildLayerTree(
    {
      elements: context.snapshot.elements,
      expandedNodeIds: new Set<string>(),
      groupFreedraw: context.snapshot.settings.groupFreedraw,
    },
    context.indexes,
  )

  const scopeChildrenByKey = new Map<string, readonly LayerNode[]>()
  buildScopeChildrenMap(tree, ROOT_SCOPE_KEY, scopeChildrenByKey)

  const nodeScopeById = new Map<string, string>()
  buildNodeScopeIndex(tree, ROOT_SCOPE_KEY, nodeScopeById)

  const selectedBlocks = collectSelectedBlocks(tree, selectedIds, ROOT_SCOPE_KEY)
  if (selectedBlocks.length === 0) {
    return err("No selected rows could be resolved for reorder.")
  }

  const selectedNodeIdsByScope = new Map<string, Set<string>>()
  for (const block of selectedBlocks) {
    const selectedNodeIds = selectedNodeIdsByScope.get(block.scopeKey)
    if (selectedNodeIds) {
      selectedNodeIds.add(block.nodeId)
      continue
    }

    selectedNodeIdsByScope.set(block.scopeKey, new Set([block.nodeId]))
  }

  const reorderedChildrenByScope = new Map<string, readonly LayerNode[]>()

  if (hasAnchorTarget) {
    const anchorNodeId = input.anchorNodeId ?? ""
    const anchorScopeKey = nodeScopeById.get(anchorNodeId)
    if (!anchorScopeKey) {
      return err(`Relative reorder anchor not found: ${anchorNodeId}.`)
    }

    const selectedNodeIds = selectedNodeIdsByScope.get(anchorScopeKey)
    if (!selectedNodeIds || selectedNodeIdsByScope.size !== 1) {
      return err(
        "Relative reorder requires the dragged rows and target row to share one canonical parent scope.",
      )
    }

    const children = scopeChildrenByKey.get(anchorScopeKey)
    if (!children || children.length === 0) {
      return err("Relative reorder scope is empty or no longer available.")
    }

    const reordered = reorderScopeChildrenRelativeToAnchor(
      children,
      selectedNodeIds,
      anchorNodeId,
      requestedPlacement,
    )
    if (!reordered.ok) {
      return reordered
    }

    if (!haveSameNodeOrder(children, reordered.value)) {
      reorderedChildrenByScope.set(anchorScopeKey, reordered.value)
    }
  } else {
    const mode = requestedMode

    for (const [scopeKey, selectedNodeIds] of selectedNodeIdsByScope) {
      const children = scopeChildrenByKey.get(scopeKey)
      if (!children || children.length === 0) {
        continue
      }

      const reordered = reorderScopeChildren(children, selectedNodeIds, mode)
      if (!haveSameNodeOrder(children, reordered)) {
        reorderedChildrenByScope.set(scopeKey, reordered)
      }
    }
  }

  if (reorderedChildrenByScope.size === 0) {
    return ok(emptyPatch())
  }

  const nextSceneOrder = flattenScopeToSceneOrder(
    ROOT_SCOPE_KEY,
    scopeChildrenByKey,
    reorderedChildrenByScope,
    sceneIndexById,
  )

  if (!isFullPermutation(currentSceneOrder, nextSceneOrder)) {
    return err("Reorder planner failed to emit a full-scene permutation.")
  }

  if (haveSameIdsInSameOrder(currentSceneOrder, nextSceneOrder)) {
    return ok(emptyPatch())
  }

  return ok({
    elementPatches: [],
    reorder: {
      orderedElementIds: nextSceneOrder,
    },
  })
}
