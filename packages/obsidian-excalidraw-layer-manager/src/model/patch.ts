import type { ElementDTO } from "./entities.js"

export type ElementMutableFields = Pick<
  ElementDTO,
  "groupIds" | "frameId" | "opacity" | "locked" | "isDeleted" | "customData" | "name"
>

export interface ElementPatch {
  readonly id: string
  readonly set: Partial<ElementMutableFields>
}

export interface ReorderPatch {
  readonly orderedElementIds: readonly string[]
}

export interface ScenePatch {
  readonly elementPatches: readonly ElementPatch[]
  readonly reorder?: ReorderPatch
  readonly selectIds?: readonly string[]
}

export const emptyPatch = (): ScenePatch => ({
  elementPatches: [],
})
