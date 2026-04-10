import type { StructuralLayerNode, VisibleRowNode } from "../../../model/tree.js"
import type { ElementVisualState } from "../../renderer.js"
import {
  type SidepanelFilterMatchKind,
  type SidepanelLockState,
  type SidepanelRowVisualState,
  type SidepanelVisibilityState,
  buildSidepanelRowSearchText,
} from "./rowPresentation.js"

export type {
  SidepanelFilterMatchKind,
  SidepanelLockState,
  SidepanelRowVisualState,
  SidepanelVisibilityState,
} from "./rowPresentation.js"

interface SidepanelRowFilterResult {
  readonly visibleTree: readonly VisibleRowNode[]
  readonly active: boolean
  readonly query: string
  readonly renderedRowCount: number
  readonly searchableRowCount: number
  readonly matchingRowCount: number
  readonly contextRowCount: number
  readonly matchKindByNodeId: ReadonlyMap<string, SidepanelFilterMatchKind>
}

const normalizeQuery = (value: string): string => value.trim().toLowerCase()

const countRenderedRows = (nodes: readonly VisibleRowNode[]): number => {
  let total = 0

  const walk = (nextNodes: readonly VisibleRowNode[]): void => {
    for (const node of nextNodes) {
      total += 1

      if (node.children.length > 0) {
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return total
}

const countSearchableRows = (nodes: readonly StructuralLayerNode[]): number => {
  let total = 0

  const walk = (nextNodes: readonly StructuralLayerNode[]): void => {
    for (const node of nextNodes) {
      total += 1
      if (node.children.length > 0) {
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return total
}

const projectExpandedVisibleRows = (
  nodes: readonly StructuralLayerNode[],
): readonly VisibleRowNode[] => {
  return nodes.map((node) => ({
    ...node,
    children: node.isExpanded ? projectExpandedVisibleRows(node.children) : [],
    canExpand: node.canExpand || node.children.length > 0,
  }))
}

const countFilterMatchKinds = (
  matchKindByNodeId: ReadonlyMap<string, SidepanelFilterMatchKind>,
): {
  readonly matchingRowCount: number
  readonly contextRowCount: number
} => {
  let matchingRowCount = 0
  let contextRowCount = 0

  for (const matchKind of matchKindByNodeId.values()) {
    if (matchKind === "self") {
      matchingRowCount += 1
      continue
    }

    if (matchKind === "descendant") {
      contextRowCount += 1
    }
  }

  return {
    matchingRowCount,
    contextRowCount,
  }
}

const filterNodesForQuery = (
  nodes: readonly StructuralLayerNode[],
  query: string,
  matchKindByNodeId: Map<string, SidepanelFilterMatchKind>,
): readonly VisibleRowNode[] => {
  const filtered: VisibleRowNode[] = []

  for (const node of nodes) {
    const filteredChildren = filterNodesForQuery(node.children, query, matchKindByNodeId)
    const selfMatches = buildSidepanelRowSearchText(node).includes(query)

    if (!selfMatches && filteredChildren.length === 0) {
      continue
    }

    matchKindByNodeId.set(node.id, selfMatches ? "self" : "descendant")
    filtered.push({
      ...node,
      children: filteredChildren,
      // Filter mode projects the currently relevant descendants directly and suppresses
      // expand/collapse affordances so visible-row controls stay honest about what the
      // filter can actually reveal.
      canExpand: false,
      isExpanded: filteredChildren.length > 0,
    })
  }

  return filtered
}

export const buildSidepanelVisibleRowTreeResult = (
  structuralTree: readonly StructuralLayerNode[],
  query: string,
): SidepanelRowFilterResult => {
  const normalizedQuery = normalizeQuery(query)
  const searchableRowCount = countSearchableRows(structuralTree)

  if (normalizedQuery.length === 0) {
    const visibleTree = projectExpandedVisibleRows(structuralTree)

    return {
      visibleTree,
      active: false,
      query: "",
      renderedRowCount: countRenderedRows(visibleTree),
      searchableRowCount,
      matchingRowCount: 0,
      contextRowCount: 0,
      matchKindByNodeId: new Map(),
    }
  }

  const matchKindByNodeId = new Map<string, SidepanelFilterMatchKind>()
  const visibleTree = filterNodesForQuery(structuralTree, normalizedQuery, matchKindByNodeId)
  const { matchingRowCount, contextRowCount } = countFilterMatchKinds(matchKindByNodeId)

  return {
    visibleTree,
    active: true,
    query: normalizedQuery,
    renderedRowCount: countRenderedRows(visibleTree),
    searchableRowCount,
    matchingRowCount,
    contextRowCount,
    matchKindByNodeId,
  }
}

export const resolveSidepanelRowVisualState = (
  node: StructuralLayerNode,
  elementStateById?: ReadonlyMap<string, ElementVisualState>,
): SidepanelRowVisualState => {
  if (!elementStateById || node.elementIds.length === 0) {
    return {
      visibility: "visible",
      lock: "unlocked",
    }
  }

  let knownElements = 0
  let hiddenCount = 0
  let lockedCount = 0

  for (const elementId of node.elementIds) {
    const state = elementStateById.get(elementId)
    if (!state) {
      continue
    }

    knownElements += 1
    if (state.opacity <= 0) {
      hiddenCount += 1
    }
    if (state.locked) {
      lockedCount += 1
    }
  }

  if (knownElements === 0) {
    return {
      visibility: "visible",
      lock: "unlocked",
    }
  }

  const visibility: SidepanelVisibilityState =
    hiddenCount === 0 ? "visible" : hiddenCount === knownElements ? "hidden" : "mixed"

  const lock: SidepanelLockState =
    lockedCount === 0 ? "unlocked" : lockedCount === knownElements ? "locked" : "mixed"

  return {
    visibility,
    lock,
  }
}
