import type { ElementDTO } from "./entities.js"

export type LayerNodeType = "frame" | "group" | "element" | "freedrawBucket"

export interface LayerNode {
  readonly id: string
  readonly type: LayerNodeType
  readonly elementIds: readonly string[]
  readonly primaryElementId: string
  readonly children: readonly LayerNode[]
  readonly canExpand: boolean
  readonly isExpanded: boolean
  readonly groupId: string | null
  readonly frameId: string | null
  readonly label: string
}

export interface TreeBuildContext {
  readonly elements: readonly ElementDTO[]
  readonly expandedNodeIds: ReadonlySet<string>
  readonly groupFreedraw: boolean
}
