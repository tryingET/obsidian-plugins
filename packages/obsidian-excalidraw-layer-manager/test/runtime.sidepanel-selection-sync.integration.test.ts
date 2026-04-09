import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"

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

  click(): void {
    this.dispatchEvent(new FakeDomEvent("click"))
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
    setTitle: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    getHostEA: () => unknown
  }
  readonly contentEl: FakeDomElement
}

const makeSidepanelTab = (document: FakeDocument, hostEA: unknown): SidepanelTabHarness => {
  const contentEl = document.createElement("div")
  const setTitle = vi.fn()
  const open = vi.fn()
  const close = vi.fn()

  const tab: SidepanelTabHarness["tab"] = {
    contentEl: contentEl as unknown as HTMLElement,
    setTitle,
    open,
    close,
    getHostEA: () => hostEA,
  }

  return {
    tab,
    contentEl,
  }
}

const cloneElement = (element: RawExcalidrawElement): RawExcalidrawElement => ({
  ...element,
  groupIds: [...(element.groupIds ?? [])],
  customData: { ...(element.customData ?? {}) },
})

const flattenElements = (root: FakeDomElement): FakeDomElement[] => {
  const all: FakeDomElement[] = []

  const walk = (element: FakeDomElement): void => {
    all.push(element)

    for (const child of element.children) {
      walk(child)
    }
  }

  walk(root)
  return all
}

const getContentRoot = (contentEl: FakeDomElement): FakeDomElement => {
  const root = contentEl.children[0]
  if (!root) {
    throw new Error("Expected sidepanel content root to exist.")
  }

  return root
}

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

interface RuntimeWithSidepanel {
  readonly ea: EaLike
  readonly elements: RawExcalidrawElement[]
  readonly sidepanelTab: SidepanelTabHarness
  readonly updateScene: ReturnType<typeof vi.fn>
  readonly selectInView: ReturnType<typeof vi.fn>
  readonly setView: ReturnType<typeof vi.fn>
  readonly clearViewBinding: () => void
  readonly emitSceneChange: (appState?: unknown) => void
}

interface MakeRuntimeWithSidepanelOptions {
  readonly requireSetViewForSelectCalls?: boolean
}

const makeRuntimeWithSidepanel = (
  document: FakeDocument,
  initialElements: readonly RawExcalidrawElement[],
  selectedIds: readonly string[],
  options: MakeRuntimeWithSidepanelOptions = {},
): RuntimeWithSidepanel => {
  const elements = initialElements.map(cloneElement)
  const selectedIdSet = new Set(selectedIds)
  const sidepanelTab = makeSidepanelTab(document, null)

  const sceneChangeListeners = new Set<
    (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
  >()

  const setSelectedIds = (ids: readonly string[]): void => {
    selectedIdSet.clear()
    for (const id of ids) {
      selectedIdSet.add(id)
    }
  }

  const readSelectedIdsFromAppState = (appState: unknown): readonly string[] | null => {
    if (!appState || typeof appState !== "object") {
      return null
    }

    const selectedElementIdsCandidate = (appState as Record<string, unknown>)["selectedElementIds"]
    if (!selectedElementIdsCandidate || typeof selectedElementIdsCandidate !== "object") {
      return null
    }

    return Object.keys(selectedElementIdsCandidate as Record<string, unknown>).filter(
      (id) => (selectedElementIdsCandidate as Record<string, unknown>)[id] === true,
    )
  }

  const emitSceneChange = (appState: unknown = {}): void => {
    const snapshot = elements.map(cloneElement)
    for (const listener of [...sceneChangeListeners]) {
      listener(snapshot, appState, {})
    }
  }

  const updateScene = vi.fn((scene: { elements?: RawExcalidrawElement[]; appState?: unknown }) => {
    if (Array.isArray(scene.elements)) {
      elements.splice(0, elements.length, ...scene.elements.map(cloneElement))
    }

    const selectedIdsFromAppState = readSelectedIdsFromAppState(scene.appState)
    if (selectedIdsFromAppState) {
      setSelectedIds(selectedIdsFromAppState)
    }

    emitSceneChange(scene.appState ?? {})
  })

  let viewBound = true

  const setView = vi.fn(() => {
    viewBound = true

    return {
      id: "fake-view",
    }
  })

  const clearViewBinding = (): void => {
    viewBound = false
  }

  const selectInView = vi.fn((ids: readonly string[]) => {
    if (options.requireSetViewForSelectCalls === true && !viewBound) {
      throw new Error("targetView not set")
    }

    setSelectedIds(ids)
  })

  const ea: EaLike = {
    setView,
    getViewElements: () => elements,
    getViewSelectedElements: () => {
      return elements.filter((element) => selectedIdSet.has(element.id))
    },
    selectElementsInView: selectInView,
    getScriptSettings: () => ({}),
    getExcalidrawAPI: () => ({
      updateScene,
      onChange: (callback) => {
        sceneChangeListeners.add(callback)
        return () => {
          sceneChangeListeners.delete(callback)
        }
      },
    }),
    sidepanelTab: null,
    createSidepanelTab: () => sidepanelTab.tab,
  }

  sidepanelTab.tab.getHostEA = () => ea

  return {
    ea,
    elements,
    sidepanelTab,
    updateScene,
    selectInView,
    setView,
    clearViewBinding,
    emitSceneChange,
  }
}

describe("sidepanel selection-sync integration", () => {
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

  it("uses onChange selectedElementIds hints for canvas-to-sidepanel selection sync", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      [],
    )

    const app = createLayerManagerRuntime(runtime.ea)

    runtime.emitSceneChange({
      selectedElementIds: {
        A: true,
      },
    })

    await flushAsync()

    expect([...app.getSnapshot().selectedIds]).toEqual(["A"])

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const interactiveRows = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const selectedRows = interactiveRows.filter((row) => (row.style["background"]?.length ?? 0) > 0)
    expect(selectedRows.length).toBe(1)
  })

  it("mirrors sidepanel row clicks to host selection bridge", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const row = flattenElements(contentRoot).find(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    if (!row) {
      throw new Error("Expected a clickable row in sidepanel content.")
    }

    row.click()
    await flushAsync()

    expect(runtime.selectInView).toHaveBeenCalledTimes(1)
    const selectedIds = runtime.selectInView.mock.calls[0]?.[0] as readonly string[] | undefined
    expect(selectedIds?.length ?? 0).toBeGreaterThan(0)
  })

  it("rebinds view context before row-click selection bridge when host requires setView", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      [],
      {
        requireSetViewForSelectCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)
    runtime.clearViewBinding()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const row = flattenElements(contentRoot).find(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    if (!row) {
      throw new Error("Expected a clickable row in sidepanel content.")
    }

    row.click()
    await flushAsync()

    expect(runtime.setView).toHaveBeenCalled()
    expect(runtime.selectInView).toHaveBeenCalledTimes(1)
  })

  it("keeps row focus marker when host selection bridge emits immediate blur on row click", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    const baseSelectInViewImplementation = runtime.selectInView.getMockImplementation()
    runtime.selectInView.mockImplementation((ids: readonly string[]) => {
      baseSelectInViewImplementation?.(ids)

      const root = getContentRoot(runtime.sidepanelTab.contentEl)
      const outsideTarget = fakeDocument.createElement("div")
      fakeDocument.activeElement = outsideTarget

      const focusOutEvent = new FakeDomEvent("focusout")
      ;(focusOutEvent as unknown as { relatedTarget?: EventTarget | null }).relatedTarget =
        outsideTarget as unknown as EventTarget

      root.dispatchEvent(focusOutEvent)
    })

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const row = flattenElements(contentRoot).find(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    if (!row) {
      throw new Error("Expected a clickable row in sidepanel content.")
    }

    row.click()
    await flushAsync()

    const refreshedRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const hasFocusedRow = flattenElements(refreshedRoot).some((element) => {
      return (element.style["outline"]?.length ?? 0) > 0
    })

    expect(hasFocusedRow).toBe(true)
  })

  it("falls back to appState selection writes when host selection bridge is unavailable", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      [],
    )

    const app = createLayerManagerRuntime(runtime.ea)
    Reflect.deleteProperty(runtime.ea, "selectElementsInView")

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const interactiveRows = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const targetRow = interactiveRows[1]
    if (!targetRow) {
      throw new Error("Expected at least two interactive rows for selection fallback test.")
    }

    targetRow.click()
    await flushAsync()

    expect(runtime.updateScene).toHaveBeenCalled()

    const lastCallIndex = runtime.updateScene.mock.calls.length - 1
    const lastUpdateArg = runtime.updateScene.mock.calls[lastCallIndex]?.[0] as
      | { appState?: { selectedElementIds?: Record<string, boolean> } }
      | undefined

    const selectedElementIds = lastUpdateArg?.appState?.selectedElementIds ?? {}
    const selectedIds = Object.keys(selectedElementIds).filter(
      (id) => selectedElementIds[id] === true,
    )

    expect(selectedIds.length).toBe(1)
    expect(["A", "B"]).toContain(selectedIds[0])
    expect([...app.getSnapshot().selectedIds]).toEqual(selectedIds)
  })

  it("clears stale row-click override when host emits newer canvas selection", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
        { id: "C", type: "rectangle", isDeleted: false },
      ],
      [],
    )

    const app = createLayerManagerRuntime(runtime.ea)
    await flushAsync()

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const interactiveRows = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const initialRow = interactiveRows[0]
    if (!initialRow) {
      throw new Error("Expected at least one interactive row.")
    }

    initialRow.click()

    const lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    const clickedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    const selectedIdAfterRowClick = clickedIds?.[0]
    if (!selectedIdAfterRowClick) {
      throw new Error("Expected selected id from row-click bridge call.")
    }

    const targetSelectionId = runtime.elements
      .map((element) => element.id)
      .find((id) => id !== selectedIdAfterRowClick)

    if (!targetSelectionId) {
      throw new Error("Expected alternative selection id for override-clear test.")
    }

    runtime.emitSceneChange({
      selectedElementIds: {
        [targetSelectionId]: true,
      },
    })

    await flushAsync()

    expect([...app.getSnapshot().selectedIds]).toEqual([targetSelectionId])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const rowsAfterCanvasSelection = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const selectedIndexAfter = rowsAfterCanvasSelection.findIndex(
      (row) => (row.style["background"]?.length ?? 0) > 0,
    )

    expect(selectedIndexAfter).toBeGreaterThanOrEqual(0)
    expect(runtime.selectInView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })
})
