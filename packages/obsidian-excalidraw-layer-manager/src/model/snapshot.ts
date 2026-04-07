import type { ElementDTO } from "./entities.js"
import type { LayerManagerSettings } from "./settings.js"

export interface SceneSnapshot {
  readonly version: number
  readonly elements: readonly ElementDTO[]
  readonly selectedIds: ReadonlySet<string>
  readonly settings: Readonly<LayerManagerSettings>
}
