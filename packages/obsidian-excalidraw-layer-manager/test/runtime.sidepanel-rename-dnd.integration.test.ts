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

const findButtonByTitle = (root: FakeDomElement, title: string): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "BUTTON" && element.title === title)
}

const findButtonByExactText = (root: FakeDomElement, label: string): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "BUTTON" && element.textContent === label)
}

const isRowFilterInput = (element: FakeDomElement): boolean => {
  return (element as FakeDomElement & { placeholder?: string }).placeholder === "Search layer rows"
}

const findFirstInput = (root: FakeDomElement): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "INPUT" && !isRowFilterInput(element))
}

const findInteractiveRowByLabel = (
  root: FakeDomElement,
  labelPrefix: string,
): FakeDomElement | undefined => {
  const elements = flattenElements(root)

  const label = elements.find(
    (element) =>
      element.tagName === "SPAN" &&
      typeof element.textContent === "string" &&
      element.textContent.startsWith(labelPrefix),
  )

  if (!label) {
    return undefined
  }

  const parent = label.parentElement
  if (!parent) {
    return undefined
  }

  if (parent.tagName !== "DIV" || parent.style["cursor"] !== "pointer") {
    return undefined
  }

  return parent
}

const getContentRoot = (contentEl: FakeDomElement): FakeDomElement => {
  const root = contentEl.children[0]
  if (!root) {
    throw new Error("Expected sidepanel content root to exist.")
  }

  return root
}

const dispatchKeydown = (receiver: FakeDomElement, key: string): void => {
  receiver.dispatchEvent(
    new FakeDomEvent("keydown", {
      key,
    }),
  )
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
  readonly copyForEditing: ReturnType<typeof vi.fn>
  readonly addToView: ReturnType<typeof vi.fn>
  readonly updateScene: ReturnType<typeof vi.fn>
}

interface MakeRuntimeWithSidepanelOptions {
  readonly disableElementEditCapabilities?: boolean
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

  let editableById = new Map<string, RawExcalidrawElement>()

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

  const copyForEditing = vi.fn((targets?: readonly RawExcalidrawElement[]) => {
    if (targets && targets.length > 0) {
      editableById = new Map(targets.map((element) => [element.id, cloneElement(element)]))
      return
    }

    editableById = new Map(elements.map((element) => [element.id, cloneElement(element)]))
  })

  const addToView = vi.fn(async () => {
    const nextElements = elements.map((element) => editableById.get(element.id) ?? element)
    elements.splice(0, elements.length, ...nextElements)
    editableById = new Map()
    emitSceneChange()
  })

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

  const ea: EaLike = {
    setView: vi.fn(() => {
      return {
        id: "fake-view",
      }
    }),
    getViewElements: () => elements,
    getViewSelectedElements: () => {
      return elements.filter((element) => selectedIdSet.has(element.id))
    },
    selectElementsInView: (ids: readonly string[]) => {
      setSelectedIds(ids)
    },
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

  if (!options.disableElementEditCapabilities) {
    ea.copyViewElementsToEAforEditing = copyForEditing
    ea.getElement = (id: string) => editableById.get(id)
    ea.addElementsToView = addToView
  }

  sidepanelTab.tab.getHostEA = () => ea

  return {
    ea,
    elements,
    sidepanelTab,
    copyForEditing,
    addToView,
    updateScene,
  }
}

describe("sidepanel rename + drag-drop integration", () => {
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

  it("starts inline rename from row action button and commits via Enter", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        {
          id: "A",
          type: "rectangle",
          name: "Old name",
          customData: {
            foreign: true,
          },
        },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const renameButton = findButtonByTitle(contentRoot, "Rename layer")

    if (!renameButton) {
      throw new Error("Expected rename row action button to exist.")
    }

    renameButton.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input to exist after clicking rename action.")
    }

    input.value = "Renamed from button"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")
    await flushAsync()

    expect(runtime.elements.find((element) => element.id === "A")?.name).toBe("Renamed from button")
    expect(runtime.elements.find((element) => element.id === "A")?.customData).toEqual({
      foreign: true,
      lmx: {
        label: "Renamed from button",
      },
    })
  })

  it("starts inline rename from row action button and commits via Enter when legacy edit APIs are unavailable", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", name: "Old name" }],
      [],
      {
        disableElementEditCapabilities: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const renameButton = findButtonByTitle(contentRoot, "Rename layer")

    if (!renameButton) {
      throw new Error("Expected rename row action button to exist.")
    }

    renameButton.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input to exist after clicking rename action.")
    }

    input.value = "Renamed from fallback"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")
    await flushAsync()

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.find((element) => element.id === "A")?.name).toBe(
      "Renamed from fallback",
    )
  })

  it("starts inline rename from row double-click and commits via Enter", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", name: "Old name" }],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const row = findInteractiveRowByLabel(contentRoot, "[element]")
    if (!row) {
      throw new Error("Expected interactive row for rename double-click path.")
    }

    row.dispatchEvent(new FakeDomEvent("dblclick"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input to exist after row double-click.")
    }

    input.value = "Renamed from double click"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")
    await flushAsync()

    expect(runtime.elements.find((element) => element.id === "A")?.name).toBe(
      "Renamed from double click",
    )
  })

  it("saves group rename and reflects new group row label", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        {
          id: "A",
          type: "rectangle",
          groupIds: ["G"],
          customData: {
            foreign: "A",
          },
        },
        {
          id: "B",
          type: "rectangle",
          groupIds: ["G"],
          name: "Legacy representative",
          customData: {
            lmx: {
              groupLabels: {
                other: "Other group",
              },
            },
          },
        },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const groupRow = findInteractiveRowByLabel(contentRoot, "[group] Legacy representative")
    if (!groupRow) {
      throw new Error("Expected interactive group row.")
    }

    groupRow.dispatchEvent(new FakeDomEvent("dblclick"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input to exist for group row.")
    }

    input.value = "Renamed Group"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")
    for (let index = 0; index < 5; index += 1) {
      await flushAsync()
    }

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findInteractiveRowByLabel(contentRoot, "[group] Renamed Group")).toBeDefined()
    expect(runtime.elements.find((element) => element.id === "A")?.name).toBeUndefined()
    expect(runtime.elements.find((element) => element.id === "B")?.name).toBe(
      "Legacy representative",
    )
    expect(runtime.elements.find((element) => element.id === "A")?.customData).toEqual({
      foreign: "A",
      lmx: {
        groupLabels: {
          G: "Renamed Group",
        },
      },
    })
    expect(runtime.elements.find((element) => element.id === "B")?.customData).toEqual({
      lmx: {
        groupLabels: {
          G: "Renamed Group",
          other: "Other group",
        },
      },
    })
  })

  it("preserves group structure when quick-move starts from a clicked group row", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", groupIds: ["G", "Outer"] },
        { id: "B", type: "rectangle", groupIds: ["G", "Outer"] },
        { id: "C", type: "rectangle", groupIds: ["Outer"] },
      ],
      [],
    )

    const app = createLayerManagerRuntime(runtime.ea)
    app.toggleExpanded("group:Outer")
    await flushAsync()

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const groupRow = findInteractiveRowByLabel(contentRoot, "[group] G")
    const rootButton = findButtonByExactText(contentRoot, "Root")

    if (!groupRow || !rootButton) {
      throw new Error("Expected group-row quick-move controls to exist.")
    }

    groupRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const refreshedRootButton = findButtonByExactText(contentRoot, "Root")
    if (!refreshedRootButton) {
      throw new Error("Expected root quick-move button after row selection.")
    }

    refreshedRootButton.click()
    await flushAsync()

    expect(runtime.elements.find((element) => element.id === "A")?.groupIds ?? []).toEqual(["G"])
    expect(runtime.elements.find((element) => element.id === "B")?.groupIds ?? []).toEqual(["G"])
    expect(runtime.elements.find((element) => element.id === "C")?.groupIds ?? []).toEqual([
      "Outer",
    ])
  })

  it("reparents rows through drag and drop using the command seam", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", name: "Source", groupIds: ["H"] },
        { id: "H-anchor", type: "rectangle", groupIds: ["H"] },
        { id: "B", type: "rectangle", groupIds: ["G"] },
      ],
      [],
    )

    const app = createLayerManagerRuntime(runtime.ea)
    app.toggleExpanded("group:H")
    await flushAsync()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const sourceRow = findInteractiveRowByLabel(contentRoot, "[element] Source")
    const targetRow = findInteractiveRowByLabel(contentRoot, "[group] G")

    if (!sourceRow || !targetRow) {
      throw new Error("Expected source/target rows for drag-drop test.")
    }

    sourceRow.dispatchEvent(new FakeDomEvent("dragstart"))
    targetRow.dispatchEvent(new FakeDomEvent("dragover"))
    targetRow.dispatchEvent(new FakeDomEvent("drop"))
    await flushAsync()

    expect(runtime.elements.find((element) => element.id === "A")?.groupIds ?? []).toEqual(["G"])
  })

  it("reorders same-parent rows through drag and drop instead of silently reparenting them", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", name: "Alpha" },
        { id: "B", type: "rectangle", name: "Beta" },
        { id: "C", type: "rectangle", name: "Gamma" },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const sourceRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")
    const targetRow = findInteractiveRowByLabel(contentRoot, "[element] Beta")

    if (!sourceRow || !targetRow) {
      throw new Error("Expected same-parent drag source and target rows.")
    }

    sourceRow.dispatchEvent(new FakeDomEvent("dragstart"))
    targetRow.dispatchEvent(new FakeDomEvent("dragover"))
    targetRow.dispatchEvent(new FakeDomEvent("drop"))
    await flushAsync()

    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "A", "C"])
    expect(runtime.elements.find((element) => element.id === "A")?.groupIds ?? []).toEqual([])
    expect(runtime.elements.find((element) => element.id === "B")?.groupIds ?? []).toEqual([])
  })

  it("drops grouped frame children onto the frame row to move them to the frame root", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "F", type: "frame", name: "Board" },
        { id: "A", type: "rectangle", name: "Source", frameId: "F", groupIds: ["G"] },
        { id: "B", type: "rectangle", frameId: "F", groupIds: ["G"] },
        { id: "C", type: "rectangle", name: "Frame peer", frameId: "F", groupIds: [] },
      ],
      [],
    )

    const app = createLayerManagerRuntime(runtime.ea)
    app.toggleExpanded("frame:F")
    app.toggleExpanded("group:G")
    await flushAsync()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const sourceRow = findInteractiveRowByLabel(contentRoot, "[element] Source")
    const frameRow = findInteractiveRowByLabel(contentRoot, "[frame] Board")

    if (!sourceRow || !frameRow) {
      throw new Error("Expected grouped frame child and frame-row drop target.")
    }

    sourceRow.dispatchEvent(new FakeDomEvent("dragstart"))
    frameRow.dispatchEvent(new FakeDomEvent("dragover"))
    frameRow.dispatchEvent(new FakeDomEvent("drop"))
    await flushAsync()

    expect(runtime.elements.find((element) => element.id === "A")?.frameId).toBe("F")
    expect(runtime.elements.find((element) => element.id === "A")?.groupIds ?? []).toEqual([])
    expect(runtime.elements.find((element) => element.id === "B")?.groupIds ?? []).toEqual(["G"])
    expect(runtime.elements.find((element) => element.id === "C")?.groupIds ?? []).toEqual([])
  })

  it("moves grouped leaf rows out to root without preserving the old parent group", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", name: "Source", groupIds: ["G"] },
        { id: "B", type: "rectangle", groupIds: ["G"] },
        { id: "C", type: "rectangle", name: "Canvas", groupIds: [] },
      ],
      [],
    )

    const app = createLayerManagerRuntime(runtime.ea)
    app.toggleExpanded("group:G")
    await flushAsync()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const sourceRow = findInteractiveRowByLabel(contentRoot, "[element] Source")
    const targetRow = findInteractiveRowByLabel(contentRoot, "[element] Canvas")

    if (!sourceRow || !targetRow) {
      throw new Error("Expected grouped leaf drag source and root drop target rows.")
    }

    sourceRow.dispatchEvent(new FakeDomEvent("dragstart"))
    targetRow.dispatchEvent(new FakeDomEvent("dragover"))
    targetRow.dispatchEvent(new FakeDomEvent("drop"))
    await flushAsync()

    expect(runtime.elements.find((element) => element.id === "A")?.groupIds ?? []).toEqual([])
    expect(runtime.elements.find((element) => element.id === "B")?.groupIds ?? []).toEqual(["G"])
  })
})
