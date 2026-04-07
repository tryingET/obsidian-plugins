import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ScriptSettings } from "../src/adapter/excalidraw-types.js"
import type { LayerNode } from "../src/model/tree.js"
import { createExcalidrawSidepanelRenderer } from "../src/ui/excalidrawSidepanelRenderer.js"

interface FakeDomEventInit {
  key?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

class FakeDomEvent {
  readonly type: string
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  target: EventTarget | null = null
  defaultPrevented = false
  propagationStopped = false

  constructor(type: string, init: FakeDomEventInit = {}) {
    this.type = type
    this.key = init.key ?? ""
    this.ctrlKey = init.ctrlKey ?? false
    this.metaKey = init.metaKey ?? false
    this.altKey = init.altKey ?? false
    this.shiftKey = init.shiftKey ?? false
  }

  preventDefault(): void {
    this.defaultPrevented = true
  }

  stopPropagation(): void {
    this.propagationStopped = true
  }
}

class FakeDomElement {
  readonly tagName: string
  readonly ownerDocument: FakeDocument
  readonly style: Record<string, string> = {}

  textContent: string | null = ""
  type = ""
  value = ""
  disabled = false
  title = ""
  tabIndex = 0
  draggable = false
  parentElement: FakeDomElement | null = null

  #children: FakeDomElement[] = []
  #listeners = new Map<string, Set<(event: FakeDomEvent) => void>>()

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
  }

  get children(): readonly FakeDomElement[] {
    return this.#children
  }

  appendChild(child: FakeDomElement): FakeDomElement {
    child.parentElement = this
    this.#children.push(child)
    return child
  }

  contains(candidate: FakeDomElement | null): boolean {
    if (!candidate) {
      return false
    }

    if (candidate === this) {
      return true
    }

    for (const child of this.#children) {
      if (child.contains(candidate)) {
        return true
      }
    }

    return false
  }

  addEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set())
    }

    this.#listeners.get(type)?.add(listener)
  }

  removeEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    this.#listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: FakeDomEvent): boolean {
    if (!event.target) {
      event.target = this as unknown as EventTarget
    }

    const listeners = this.#listeners.get(event.type)
    if (!listeners || listeners.size === 0) {
      return !event.defaultPrevented
    }

    for (const listener of [...listeners]) {
      listener(event)
      if (event.propagationStopped) {
        break
      }
    }

    return !event.defaultPrevented
  }

  focus(): void {
    this.ownerDocument.activeElement = this
  }

  set innerHTML(value: string) {
    this.#children = []
    this.textContent = value
  }

  get innerHTML(): string {
    return this.textContent ?? ""
  }
}

class FakeDocument {
  activeElement: FakeDomElement | null = null
  #listeners = new Map<string, Set<(event: FakeDomEvent) => void>>()

  createElement(tagName: string): FakeDomElement {
    return new FakeDomElement(tagName, this)
  }

  addEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set())
    }

    this.#listeners.get(type)?.add(listener)
  }

  removeEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    this.#listeners.get(type)?.delete(listener)
  }
}

interface SidepanelTabHarness {
  readonly tab: {
    contentEl?: HTMLElement
    setContent?: (content: HTMLElement | string) => void
    setTitle: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    getHostEA: () => unknown
  }
  readonly contentEl: FakeDomElement
  readonly setTitle: ReturnType<typeof vi.fn>
  readonly setContent: ReturnType<typeof vi.fn>
  readonly open: ReturnType<typeof vi.fn>
}

type SidepanelMountMode = "contentEl" | "setContentOnly"

const SIDEPANEL_MOUNT_MODE_CASES: readonly {
  readonly mountMode: SidepanelMountMode
  readonly label: string
}[] = [
  {
    mountMode: "contentEl",
    label: "contentEl",
  },
  {
    mountMode: "setContentOnly",
    label: "setContentOnly",
  },
]

const makeSidepanelTab = (
  document: FakeDocument,
  hostEA: unknown,
  includeContentEl = true,
  includeSetContent = false,
): SidepanelTabHarness => {
  const contentEl = document.createElement("div")
  const setTitle = vi.fn()
  const open = vi.fn()
  const close = vi.fn()
  const setContent = vi.fn((content: HTMLElement | string) => {
    contentEl.innerHTML = ""

    if (typeof content === "string") {
      contentEl.innerHTML = content
      return
    }

    contentEl.appendChild(content as unknown as FakeDomElement)
  })

  const tabBase = {
    setTitle,
    open,
    close,
    getHostEA: () => hostEA,
  }

  const tab: SidepanelTabHarness["tab"] = {
    ...tabBase,
  }

  if (includeContentEl) {
    tab.contentEl = contentEl as unknown as HTMLElement
  }

  if (includeSetContent) {
    tab.setContent = setContent as (content: HTMLElement | string) => void
  }

  return {
    tab,
    contentEl,
    setTitle,
    setContent,
    open,
  }
}

const makeSidepanelTabForMountMode = (
  document: FakeDocument,
  hostEA: unknown,
  mountMode: SidepanelMountMode,
): SidepanelTabHarness => {
  if (mountMode === "setContentOnly") {
    return makeSidepanelTab(document, hostEA, false, true)
  }

  return makeSidepanelTab(document, hostEA)
}

const makeElementNode = (elementId: string, label = elementId): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: true,
  groupId: null,
  frameId: null,
  label,
})

const expectMountedOutputForMode = (
  sidepanelTab: SidepanelTabHarness,
  mountMode: SidepanelMountMode,
): void => {
  if (mountMode === "setContentOnly") {
    expect(sidepanelTab.setContent).toHaveBeenCalled()
  } else {
    expect(sidepanelTab.setContent).not.toHaveBeenCalled()
  }

  expect(sidepanelTab.contentEl.children.length).toBeGreaterThan(0)
}

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe("sidepanel mount-focused integration", () => {
  const globalRecord = globalThis as Record<string, unknown>

  let hadDocumentProperty = false
  let previousDocumentValue: unknown
  let fakeDocument: FakeDocument

  beforeEach(() => {
    hadDocumentProperty = Object.prototype.hasOwnProperty.call(globalRecord, "document")
    previousDocumentValue = globalRecord["document"]

    fakeDocument = new FakeDocument()
    globalRecord["document"] = fakeDocument as unknown as Document
  })

  afterEach(() => {
    if (hadDocumentProperty) {
      globalRecord["document"] = previousDocumentValue
      return
    }

    Reflect.deleteProperty(globalRecord, "document")
  })

  for (const mountCase of SIDEPANEL_MOUNT_MODE_CASES) {
    it(`mount mode parity (${mountCase.label}): attaches through expected host path`, () => {
      const sidepanelTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)
      const host: {
        sidepanelTab: typeof sidepanelTab.tab | null
        createSidepanelTab: () => typeof sidepanelTab.tab
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: null,
        createSidepanelTab: () => sidepanelTab.tab,
        getScriptSettings: () => ({}),
      }

      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      expect(host.sidepanelTab).toBe(sidepanelTab.tab)
      expect(sidepanelTab.setTitle).toHaveBeenCalledWith("Layer Manager")
      expect(sidepanelTab.open).toHaveBeenCalledTimes(1)
      expectMountedOutputForMode(sidepanelTab, mountCase.mountMode)
    })

    it(`mount mode parity (${mountCase.label}): reuses active tab when host reference is stale`, () => {
      const staleTab = {
        setTitle: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
        getHostEA: () => null,
      }

      const activeTab = makeSidepanelTabForMountMode(
        fakeDocument,
        { previousHost: true },
        mountCase.mountMode,
      )
      const createSidepanelTab = vi.fn(() => activeTab.tab)

      const host = {
        sidepanelTab: staleTab,
        checkForActiveSidepanelTabForScript: vi.fn(() => activeTab.tab),
        createSidepanelTab,
        activeScript: "LayerManager",
        getScriptSettings: () => ({}),
      }

      const renderer = createExcalidrawSidepanelRenderer(host)
      expect(renderer).not.toBeNull()

      renderer?.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      expect(host.checkForActiveSidepanelTabForScript).toHaveBeenCalledTimes(1)
      expect(createSidepanelTab).not.toHaveBeenCalled()
      expect(host.sidepanelTab).toBe(activeTab.tab)
      expect(activeTab.setTitle).toHaveBeenCalledWith("Layer Manager")
      expect(activeTab.open).toHaveBeenCalledTimes(1)
      expectMountedOutputForMode(activeTab, mountCase.mountMode)
    })

    it(`mount mode parity (${mountCase.label}): async create attaches once promise resolves`, async () => {
      const asyncTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)

      const host: {
        sidepanelTab: typeof asyncTab.tab | null
        createSidepanelTab: () => Promise<typeof asyncTab.tab>
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: null,
        createSidepanelTab: () => Promise.resolve(asyncTab.tab),
        getScriptSettings: () => ({}),
      }

      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      expect(host.sidepanelTab).toBeNull()

      await flushAsync()

      expect(host.sidepanelTab).toBe(asyncTab.tab)
      expect(asyncTab.setTitle).toHaveBeenCalledWith("Layer Manager")
      expect(asyncTab.open).toHaveBeenCalledTimes(1)
      expectMountedOutputForMode(asyncTab, mountCase.mountMode)
    })

    it(`mount mode parity (${mountCase.label}): async create failure then recovery`, async () => {
      const recoveredTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)
      const createSidepanelTab = vi
        .fn<() => Promise<typeof recoveredTab.tab>>()
        .mockImplementationOnce(async () => {
          throw new Error("tab create failed")
        })
        .mockImplementationOnce(() => Promise.resolve(recoveredTab.tab))

      const host: {
        sidepanelTab: typeof recoveredTab.tab | null
        createSidepanelTab: () => Promise<typeof recoveredTab.tab>
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: null,
        createSidepanelTab,
        getScriptSettings: () => ({}),
      }

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      try {
        const renderer = createExcalidrawSidepanelRenderer(host)
        if (!renderer) {
          throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
        }

        renderer.render({
          tree: [makeElementNode("A")],
          selectedIds: new Set(),
          sceneVersion: 1,
        })

        await flushAsync()

        expect(host.sidepanelTab).toBeNull()
        expect(logSpy).toHaveBeenCalledWith("[LMX] Failed to create Layer Manager sidepanel tab.")

        renderer.render({
          tree: [makeElementNode("A")],
          selectedIds: new Set(),
          sceneVersion: 2,
        })

        await flushAsync()

        expect(createSidepanelTab).toHaveBeenCalledTimes(2)
        expect(host.sidepanelTab).toBe(recoveredTab.tab)
        expectMountedOutputForMode(recoveredTab, mountCase.mountMode)
      } finally {
        logSpy.mockRestore()
      }
    })
  }

  it("lifecycle debug channel tags mount failure reasons deterministically", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const setContent = vi.fn(() => {
      throw new Error("setContent failed")
    })

    const host = {
      sidepanelTab: {
        setTitle: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
        getHostEA: () => null,
        setContent,
      },
      getScriptSettings: () => ({}),
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      await flushAsync()

      expect(setContent).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith(
        "[LMX:lifecycle] mount failed with reason=setContentFailed",
      )
    } finally {
      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })

  it("lifecycle debug channel tags tabUnrenderable deterministically", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const staleHostTab = {
      setTitle: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      getHostEA: () => null,
    }

    const host = {
      sidepanelTab: staleHostTab,
      getScriptSettings: () => ({}),
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      await flushAsync()

      expect(host.sidepanelTab).toBeNull()
      expect(logSpy).toHaveBeenCalledWith(
        "[LMX:lifecycle] mount failed with reason=tabUnrenderable",
      )
    } finally {
      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })

  it("lifecycle debug channel tags tabUnavailable deterministically", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const createSidepanelTab = vi.fn(() => undefined)

    const host = {
      sidepanelTab: null,
      createSidepanelTab,
      getScriptSettings: () => ({}),
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      await flushAsync()

      expect(createSidepanelTab).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith("[LMX:lifecycle] mount failed with reason=tabUnavailable")
    } finally {
      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })

  it("lifecycle debug channel tags ownerDocumentUnavailable deterministically", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const hadDocumentPropertyInTest = Object.prototype.hasOwnProperty.call(globalRecord, "document")
    const previousDocumentInTest = globalRecord["document"]

    const sidepanelTab = makeSidepanelTab(fakeDocument, null, false, true)

    const host = {
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    }

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      Reflect.deleteProperty(globalRecord, "document")

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
      })

      await flushAsync()

      expect(sidepanelTab.setContent).not.toHaveBeenCalled()
      expect(logSpy).toHaveBeenCalledWith(
        "[LMX:lifecycle] mount failed with reason=ownerDocumentUnavailable",
      )
    } finally {
      if (hadDocumentPropertyInTest) {
        globalRecord["document"] = previousDocumentInTest
      } else {
        Reflect.deleteProperty(globalRecord, "document")
      }

      if (hadDebugFlag) {
        globalRecord[debugFlagKey] = previousDebugFlag
      } else {
        Reflect.deleteProperty(globalRecord, debugFlagKey)
      }

      logSpy.mockRestore()
    }
  })
})
