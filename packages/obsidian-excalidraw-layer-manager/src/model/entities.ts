export type ElementType =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "line"
  | "arrow"
  | "freedraw"
  | "text"
  | "image"
  | "frame"
  | "group"
  | "unknown"

export interface ElementCustomData {
  originalOpacity?: number
  [key: string]: unknown
}

export interface ElementDTO {
  id: string
  type: ElementType
  zIndex: number
  groupIds: readonly string[]
  frameId: string | null
  containerId: string | null
  opacity: number
  locked: boolean
  isDeleted: boolean
  customData: Readonly<ElementCustomData>
  name?: string
  text?: string
}
