export interface Descriptor {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  groupIds: string[]
  frameId: null
  isDeleted: boolean
  locked: boolean
  opacity: number
  customData: { foreign: { sentinel: string }; lmx: { label: string; unknown: number } }
}
export interface ExpectedRow {
  id: string
  level: number
  expanded: boolean | null
}
export function makeDescriptors(size: number, shape: string, seed: number): Descriptor[]
export function expectedRows(elements: Descriptor[], expanded: string[] | "all"): ExpectedRow[]
export function sceneProjection(elements: object[]): object[]
export function expectedFrontOrder<
  T extends { id: string; groupIds: string[]; frameId: string | null },
>(elements: T[], targetId: string): T[]
