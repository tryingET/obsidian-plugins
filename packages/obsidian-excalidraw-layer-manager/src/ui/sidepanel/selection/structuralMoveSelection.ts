import type { LayerNode } from "../../../model/tree.js"
import type { SharedFrameResolution } from "../quickmove/presetHelpers.js"

export interface StructuralMoveSelection {
  readonly nodeIds: readonly string[]
  readonly sourceGroupId: string | null
}

interface StructuralSelectionLike {
  readonly elementIds: readonly string[]
  readonly nodes: readonly LayerNode[]
  readonly explicitSelectedNodes?: readonly LayerNode[] | null | undefined
  readonly frameResolution: SharedFrameResolution
  readonly structuralMove?: StructuralMoveSelection | null
}

export const selectionIncludesFrameRows = (
  selection: Pick<StructuralSelectionLike, "nodes">,
): boolean => {
  return selection.nodes.some((node) => node.type === "frame")
}

export const selectionIncludesGroupRows = (
  selection: Pick<StructuralSelectionLike, "nodes">,
): boolean => {
  return selection.nodes.some((node) => node.type === "group")
}

export const resolveStructuralMoveSelection = (
  nodes: readonly LayerNode[],
): StructuralMoveSelection | null => {
  if (nodes.length === 0) {
    return null
  }

  if (nodes.some((node) => node.type === "frame")) {
    return null
  }

  if (nodes.length === 1) {
    const node = nodes[0]
    if (node?.type === "group" && node.groupId) {
      return {
        nodeIds: [node.id],
        sourceGroupId: node.groupId,
      }
    }
  }

  if (nodes.some((node) => node.type === "group")) {
    return null
  }

  return {
    nodeIds: nodes.map((node) => node.id),
    sourceGroupId: null,
  }
}

export const resolveExplicitSelectionNodeIds = (
  selection: Pick<StructuralSelectionLike, "explicitSelectedNodes">,
): readonly string[] => {
  return (selection.explicitSelectedNodes ?? []).map((node) => node.id)
}

export const resolveSelectionStructuralMove = (
  selection: StructuralSelectionLike,
): StructuralMoveSelection | null => {
  return selection.structuralMove ?? resolveStructuralMoveSelection(selection.nodes)
}

export const resolveStructuralSelectionIssue = (
  selection: StructuralSelectionLike,
  emptySelectionMessage = "Select rows or elements first.",
): string | null => {
  const structuralMove = resolveSelectionStructuralMove(selection)
  const hasSelection =
    selection.elementIds.length > 0 || selection.nodes.length > 0 || !!structuralMove

  if (!hasSelection) {
    return emptySelectionMessage
  }

  if (selectionIncludesFrameRows(selection)) {
    return "Selection includes frame rows."
  }

  if (!selection.frameResolution.ok) {
    return "Selection spans multiple frames."
  }

  if (selectionIncludesGroupRows(selection) && !structuralMove) {
    return "Selection includes mixed or multiple group rows."
  }

  return null
}

export const resolveFocusedNodeStructuralMove = (
  node: LayerNode,
): StructuralMoveSelection | null => {
  if (node.type === "frame") {
    return null
  }

  if (node.type === "group" && node.groupId) {
    return {
      nodeIds: [node.id],
      sourceGroupId: node.groupId,
    }
  }

  return {
    nodeIds: [node.id],
    sourceGroupId: null,
  }
}
