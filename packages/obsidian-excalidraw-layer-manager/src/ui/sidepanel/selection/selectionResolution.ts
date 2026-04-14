import type { StructuralLayerNode } from "../../../model/tree.js"
import { type SharedFrameResolution, resolveSharedFrame } from "../quickmove/presetHelpers.js"
import { resolveSelectedNodes } from "./nodeContext.js"
import { haveSameIds } from "./selectionIds.js"
import {
  type StructuralMoveSelection,
  resolveStructuralMoveSelection,
} from "./structuralMoveSelection.js"

export type SidepanelSelectionNodeRef =
  | {
      readonly kind: "groupId"
      readonly groupId: string
    }
  | {
      readonly kind: "nodeId"
      readonly nodeId: string
    }

export interface SidepanelSelectionOverrideState {
  readonly elementIds: readonly string[]
  readonly nodeRefs: readonly SidepanelSelectionNodeRef[] | null
}

export interface ResolvedSelection {
  /** Canonical selected element ids after host/snapshot reconciliation. */
  readonly elementIds: readonly string[]
  /**
   * Keyboard-first tree selection state: keep explicit row intent when present,
   * otherwise resolve the owning rows from full structural truth for canonical
   * element selection.
   */
  readonly nodes: readonly StructuralLayerNode[]
  /** Explicit row intent preserved across host/snapshot reconciliation when available. */
  readonly explicitSelectedNodes?: readonly StructuralLayerNode[] | null
  readonly frameResolution: SharedFrameResolution
  /**
   * Structural move intent is only valid when it came from explicit row intent.
   * Inferred row resolution must not silently become structural authority.
   */
  readonly structuralMove?: StructuralMoveSelection | null
}

export interface SidepanelSelectionResolution {
  readonly selection: ResolvedSelection
  readonly explicitSelectedNodes: readonly StructuralLayerNode[] | null
}

export const resolveCurrentSidepanelSelectionNodes = (
  resolution: SidepanelSelectionResolution,
): readonly StructuralLayerNode[] => {
  return resolution.explicitSelectedNodes ?? resolution.selection.nodes
}

const buildLayerNodeLookup = (
  tree: readonly StructuralLayerNode[],
): {
  readonly nodeById: ReadonlyMap<string, StructuralLayerNode>
  readonly groupNodeByGroupId: ReadonlyMap<string, StructuralLayerNode>
} => {
  const nodeById = new Map<string, StructuralLayerNode>()
  const groupNodeByGroupId = new Map<string, StructuralLayerNode>()
  const stack = [...tree]

  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) {
      continue
    }

    nodeById.set(node.id, node)

    if (node.type === "group" && node.groupId && !groupNodeByGroupId.has(node.groupId)) {
      groupNodeByGroupId.set(node.groupId, node)
    }

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]
      if (child) {
        stack.push(child)
      }
    }
  }

  return {
    nodeById,
    groupNodeByGroupId,
  }
}

export const makeSidepanelSelectionNodeRef = (
  node: StructuralLayerNode,
): SidepanelSelectionNodeRef => {
  if (node.type === "group" && node.groupId) {
    return {
      kind: "groupId",
      groupId: node.groupId,
    }
  }

  return {
    kind: "nodeId",
    nodeId: node.id,
  }
}

const resolveExplicitSelectedNodes = (
  tree: readonly StructuralLayerNode[],
  selectionOverride: SidepanelSelectionOverrideState | null,
  selectedElementIds: readonly string[],
): readonly StructuralLayerNode[] | null => {
  if (
    !selectionOverride?.nodeRefs ||
    !haveSameIds(selectionOverride.elementIds, selectedElementIds)
  ) {
    return null
  }

  const lookup = buildLayerNodeLookup(tree)
  const resolvedNodes = selectionOverride.nodeRefs
    .map((nodeRef) => {
      if (nodeRef.kind === "groupId") {
        return lookup.groupNodeByGroupId.get(nodeRef.groupId) ?? null
      }

      return lookup.nodeById.get(nodeRef.nodeId) ?? null
    })
    .filter((node): node is StructuralLayerNode => Boolean(node))

  if (resolvedNodes.length !== selectionOverride.nodeRefs.length) {
    return null
  }

  return resolvedNodes
}

/**
 * Keyboard-first tree selection model:
 * - explicit row intent is authoritative tree selection when available
 * - canonical element selection resolves through full structural ownership only when
 *   explicit row intent is absent
 * - structural move intent is only derived from the explicit row branch, so inferred
 *   ownership never silently gains structural authority
 */
export const resolveSidepanelSelection = (input: {
  readonly tree: readonly StructuralLayerNode[]
  readonly selectedElementIds: readonly string[]
  readonly selectionOverride: SidepanelSelectionOverrideState | null
}): SidepanelSelectionResolution => {
  const explicitSelectedNodes = resolveExplicitSelectedNodes(
    input.tree,
    input.selectionOverride,
    input.selectedElementIds,
  )

  const resolvedSelectionNodes =
    explicitSelectedNodes ?? resolveSelectedNodes(input.tree, input.selectedElementIds)

  return {
    explicitSelectedNodes,
    selection: {
      elementIds: input.selectedElementIds,
      nodes: resolvedSelectionNodes,
      explicitSelectedNodes,
      frameResolution: resolveSharedFrame(resolvedSelectionNodes),
      structuralMove: explicitSelectedNodes
        ? resolveStructuralMoveSelection(explicitSelectedNodes)
        : null,
    },
  }
}
