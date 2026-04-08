import type { LayerNode } from "../../../model/tree.js"
import type { ElementVisualState } from "../../renderer.js"

export type SidepanelFilterMatchKind = "none" | "self" | "descendant"
export type SidepanelVisibilityState = "visible" | "hidden" | "mixed"
export type SidepanelLockState = "unlocked" | "locked" | "mixed"

export interface SidepanelRowVisualState {
  readonly visibility: SidepanelVisibilityState
  readonly lock: SidepanelLockState
}

export interface SidepanelRowFilterResult {
  readonly tree: readonly LayerNode[]
  readonly active: boolean
  readonly query: string
  readonly renderedRowCount: number
  readonly searchableRowCount: number
  readonly matchKindByNodeId: ReadonlyMap<string, SidepanelFilterMatchKind>
}

const normalizeQuery = (value: string): string => value.trim().toLowerCase()

const countRenderedRows = (nodes: readonly LayerNode[]): number => {
  let total = 0

  const walk = (nextNodes: readonly LayerNode[]): void => {
    for (const node of nextNodes) {
      total += 1

      if (node.isExpanded && node.children.length > 0) {
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return total
}

const countSearchableRows = (nodes: readonly LayerNode[]): number => {
  let total = 0

  const walk = (nextNodes: readonly LayerNode[]): void => {
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

const makeNodeSearchText = (node: LayerNode): string => {
  return [node.label, node.type, node.groupId ?? "", node.frameId ?? "", node.id]
    .join(" ")
    .toLowerCase()
}

const filterNodesForQuery = (
  nodes: readonly LayerNode[],
  query: string,
  matchKindByNodeId: Map<string, SidepanelFilterMatchKind>,
): readonly LayerNode[] => {
  const filtered: LayerNode[] = []

  for (const node of nodes) {
    const filteredChildren = filterNodesForQuery(node.children, query, matchKindByNodeId)
    const selfMatches = makeNodeSearchText(node).includes(query)

    if (!selfMatches && filteredChildren.length === 0) {
      continue
    }

    matchKindByNodeId.set(node.id, selfMatches ? "self" : "descendant")
    filtered.push({
      ...node,
      children: filteredChildren,
      canExpand: false,
      isExpanded: filteredChildren.length > 0,
    })
  }

  return filtered
}

export const buildSidepanelRowFilterResult = (
  nodes: readonly LayerNode[],
  query: string,
): SidepanelRowFilterResult => {
  const normalizedQuery = normalizeQuery(query)
  const searchableRowCount = countSearchableRows(nodes)

  if (normalizedQuery.length === 0) {
    return {
      tree: nodes,
      active: false,
      query: "",
      renderedRowCount: countRenderedRows(nodes),
      searchableRowCount,
      matchKindByNodeId: new Map(),
    }
  }

  const matchKindByNodeId = new Map<string, SidepanelFilterMatchKind>()
  const tree = filterNodesForQuery(nodes, normalizedQuery, matchKindByNodeId)

  return {
    tree,
    active: true,
    query: normalizedQuery,
    renderedRowCount: countRenderedRows(tree),
    searchableRowCount,
    matchKindByNodeId,
  }
}

export const resolveSidepanelRowVisualState = (
  node: LayerNode,
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
