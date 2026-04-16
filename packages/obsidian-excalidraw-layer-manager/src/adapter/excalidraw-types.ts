export interface RawExcalidrawElement {
  id: string
  type?: string
  groupIds?: string[]
  frameId?: string | null
  containerId?: string | null
  opacity?: number
  locked?: boolean
  isDeleted?: boolean
  customData?: Record<string, unknown>
  name?: string
  text?: string
}

export interface ExcalidrawApiLike {
  updateScene?: (scene: { elements: RawExcalidrawElement[] }) => void
  onChange?: (
    callback: (
      elements: readonly RawExcalidrawElement[],
      appState: unknown,
      files: unknown,
    ) => void,
  ) => (() => void) | undefined
}

export interface ScriptSettingsEntry {
  value: unknown
  description?: string
}

export type ScriptSettings = Record<string, ScriptSettingsEntry>

export interface ExcalidrawSidepanelTabLike {
  contentEl?: HTMLElement
  setContent?: (content: HTMLElement | string) => void
  setTitle?: (title: string) => void
  setDisabled?: (disabled: boolean) => void
  setCloseCallback?: (callback: () => void) => void
  open?: () => void
  close?: () => void
  getHostEA?: () => unknown
  onExcalidrawViewClosed?: (() => void) | undefined
  onViewChange?: ((targetView?: unknown | null) => void) | undefined
}

export interface SidepanelLeafLike {
  detach?: () => void
}

export interface FileCacheLike {
  frontmatter?: Record<string, unknown>
}

export interface MetadataCacheLike {
  getFileCache?: (file: unknown) => FileCacheLike | null | undefined
}

export interface WorkspaceLike {
  on?: (eventName: string, callback: (...args: unknown[]) => unknown) => unknown
  offref?: (ref: unknown) => void
  getActiveFile?: () => unknown | null
}

export interface ObsidianAppLike {
  metadataCache?: MetadataCacheLike
  workspace?: WorkspaceLike
}

export interface ObsidianLike {
  Notice?: new (message: string, timeout?: number) => unknown
  getIcon?: (iconName: string) => HTMLElement | null
  app?: ObsidianAppLike
}

export interface EaLike {
  app?: ObsidianAppLike
  getViewElements?: () => RawExcalidrawElement[]
  getViewSelectedElements?: () => RawExcalidrawElement[]
  setView?: (view?: unknown, reveal?: boolean) => unknown
  targetView?: unknown | null
  getExcalidrawAPI?: () => ExcalidrawApiLike | undefined
  getScriptSettings?: () => ScriptSettings
  setScriptSettings?: (settings: ScriptSettings) => Promise<void> | void

  copyViewElementsToEAforEditing?: (
    elements?: readonly RawExcalidrawElement[],
    copyImages?: boolean,
  ) => void
  getElement?: (id: string) => RawExcalidrawElement | undefined
  addElementsToView?: (replaceAll: boolean, save: boolean) => Promise<void> | void
  selectElementsInView?: (ids: string[]) => void

  sidepanelTab?: ExcalidrawSidepanelTabLike | null
  createSidepanelTab?: (
    title: string,
    persist?: boolean,
    reveal?: boolean,
  ) => ExcalidrawSidepanelTabLike | Promise<ExcalidrawSidepanelTabLike | null> | undefined
  closeSidepanelTab?: () => void
  getSidepanelLeaf?: () => SidepanelLeafLike | null
  persistSidepanelTab?: () => ExcalidrawSidepanelTabLike | null
  checkForActiveSidepanelTabForScript?: (scriptName?: string) => ExcalidrawSidepanelTabLike | null
  activeScript?: string
  obsidian?: ObsidianLike
}
