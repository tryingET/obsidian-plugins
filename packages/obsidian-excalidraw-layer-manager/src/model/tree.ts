import type { ElementDTO } from "./entities.js"

export type LayerNodeType = "frame" | "group" | "element" | "freedrawBucket"

export interface LayerNode {
  /** Canonical row / structural identity within the derived tree. */
  readonly id: string
  readonly type: LayerNodeType
  readonly elementIds: readonly string[]
  /** Representative scene element only; never use this as row identity. */
  readonly primaryElementId: string
  readonly children: readonly LayerNode[]
  readonly canExpand: boolean
  readonly isExpanded: boolean
  readonly groupId: string | null
  readonly frameId: string | null
  readonly label: string
}

export const resolveRepresentativeElementId = (node: LayerNode): string => {
  return node.primaryElementId
}

export const resolveFrameRowElementId = (node: LayerNode): string | null => {
  return node.type === "frame" ? resolveRepresentativeElementId(node) : null
}

export interface TreeBuildContext {
  readonly elements: readonly ElementDTO[]
  readonly expandedNodeIds: ReadonlySet<string>
  readonly groupFreedraw: boolean
}
