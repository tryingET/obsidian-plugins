import type { ElementDTO } from "./entities.js"

export type LayerNodeType = "frame" | "group" | "element" | "freedrawBucket"

export interface LayerNode {
  /** Canonical row / structural identity within the derived tree. */
  readonly id: string
  readonly type: LayerNodeType
  readonly elementIds: readonly string[]
  /** Representative scene element only; never use this as row identity. */
  readonly primaryElementId: string
  /**
   * Structural trees keep the full descendant ownership graph here.
   * Visible row projections may prune this list to rendered descendants only.
   */
  readonly children: readonly LayerNode[]
  /** Row affordance only; not canonical structural authority. */
  readonly canExpand: boolean
  /** UI expansion hint only; never structural targeting authority. */
  readonly isExpanded: boolean
  readonly groupId: string | null
  readonly frameId: string | null
  readonly label: string
  /** Optional alias text for filtering when the visible row label is abbreviated. */
  readonly searchText?: string
}

/** Authoritative full-tree projection over scene truth. */
export type StructuralLayerNode = LayerNode
/** Visible row tree derived from the structural tree for render/focus/filter consumers. */
export type VisibleRowNode = LayerNode

export const resolveRepresentativeElementId = (node: LayerNode): string => {
  return node.primaryElementId
}

export const resolveFrameRowElementId = (node: LayerNode): string | null => {
  return node.type === "frame" ? resolveRepresentativeElementId(node) : null
}

export interface TreeBuildContext {
  readonly elements: readonly ElementDTO[]
  /** UI expansion hints only; descendant ownership must remain structurally complete. */
  readonly expandedNodeIds: ReadonlySet<string>
  readonly groupFreedraw: boolean
}
