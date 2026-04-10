import type { LayerNode } from "../../../model/tree.js"
import { appendUniqueIds } from "./selectionIds.js"

export interface RowClickSelectionModifiers {
  readonly shiftKey: boolean
  readonly toggleKey: boolean
}

export interface ResolveRowClickSelectionInput {
  readonly clickedNode: LayerNode
  readonly visibleNodes: readonly LayerNode[]
  readonly currentSelectedNodes: readonly LayerNode[]
  readonly currentAnchorNodeId: string | null
  readonly fallbackAnchorNodeId?: string | null
  readonly modifiers: RowClickSelectionModifiers
}

export interface RowClickSelectionResult {
  readonly selectedNodes: readonly LayerNode[]
  readonly selectedElementIds: readonly string[]
  readonly anchorNodeId: string | null
}

const appendUniqueNodes = (
  target: LayerNode[],
  seenNodeIds: Set<string>,
  nodes: readonly LayerNode[],
): void => {
  for (const node of nodes) {
    if (seenNodeIds.has(node.id)) {
      continue
    }

    seenNodeIds.add(node.id)
    target.push(node)
  }
}

const collectSelectedElementIds = (selectedNodes: readonly LayerNode[]): readonly string[] => {
  const selectedElementIds: string[] = []
  const seenElementIds = new Set<string>()

  for (const node of selectedNodes) {
    appendUniqueIds(selectedElementIds, seenElementIds, node.elementIds)
  }

  return selectedElementIds
}

const resolveVisibleRangeNodes = (
  visibleNodes: readonly LayerNode[],
  anchorNodeId: string,
  targetNodeId: string,
): readonly LayerNode[] | null => {
  const anchorIndex = visibleNodes.findIndex((node) => node.id === anchorNodeId)
  const targetIndex = visibleNodes.findIndex((node) => node.id === targetNodeId)

  if (anchorIndex < 0 || targetIndex < 0) {
    return null
  }

  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  return visibleNodes.slice(start, end + 1)
}

export const resolveRowClickSelection = (
  input: ResolveRowClickSelectionInput,
): RowClickSelectionResult => {
  const { clickedNode, currentSelectedNodes, modifiers } = input
  const currentAnchorNodeId = input.currentAnchorNodeId ?? input.fallbackAnchorNodeId ?? null

  if (modifiers.shiftKey) {
    const effectiveAnchorNodeId = currentAnchorNodeId ?? clickedNode.id
    const resolvedRangeNodes = resolveVisibleRangeNodes(
      input.visibleNodes,
      effectiveAnchorNodeId,
      clickedNode.id,
    )
    const rangeNodes = resolvedRangeNodes ?? [clickedNode]
    const nextAnchorNodeId = resolvedRangeNodes ? effectiveAnchorNodeId : clickedNode.id

    if (modifiers.toggleKey) {
      const selectedNodes: LayerNode[] = []
      const seenNodeIds = new Set<string>()
      appendUniqueNodes(selectedNodes, seenNodeIds, currentSelectedNodes)
      appendUniqueNodes(selectedNodes, seenNodeIds, rangeNodes)

      return {
        selectedNodes,
        selectedElementIds: collectSelectedElementIds(selectedNodes),
        anchorNodeId: nextAnchorNodeId,
      }
    }

    return {
      selectedNodes: rangeNodes,
      selectedElementIds: collectSelectedElementIds(rangeNodes),
      anchorNodeId: nextAnchorNodeId,
    }
  }

  if (modifiers.toggleKey) {
    const nextSelectedNodes = currentSelectedNodes.filter((node) => node.id !== clickedNode.id)
    const selectedNodes =
      nextSelectedNodes.length === currentSelectedNodes.length
        ? [...currentSelectedNodes, clickedNode]
        : nextSelectedNodes

    return {
      selectedNodes,
      selectedElementIds: collectSelectedElementIds(selectedNodes),
      anchorNodeId: selectedNodes.length > 0 ? clickedNode.id : null,
    }
  }

  return {
    selectedNodes: [clickedNode],
    selectedElementIds: collectSelectedElementIds([clickedNode]),
    anchorNodeId: clickedNode.id,
  }
}
