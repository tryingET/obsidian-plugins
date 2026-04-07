import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  EaLike,
  RawExcalidrawElement,
  ScriptSettings,
} from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"
import type { LayerNode } from "../src/model/tree.js"
import type { ExecuteIntentOutcome } from "../src/runtime/intentExecution.js"
import { createExcalidrawSidepanelRenderer } from "../src/ui/excalidrawSidepanelRenderer.js"
import type { LayerManagerUiActions, RenderViewModel } from "../src/ui/renderer.js"

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

const cloneElement = (element: RawExcalidrawElement): RawExcalidrawElement => ({
  ...element,
  groupIds: [...(element.groupIds ?? [])],
  customData: { ...(element.customData ?? {}) },
})

type SidepanelMountMode = "contentEl" | "setContentOnly"

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

const SIDEPANEL_MOUNT_TRANSITION_CASES: readonly {
  readonly fromMountMode: SidepanelMountMode
  readonly toMountMode: SidepanelMountMode
  readonly label: string
}[] = [
  {
    fromMountMode: "contentEl",
    toMountMode: "setContentOnly",
    label: "contentEl -> setContentOnly",
  },
  {
    fromMountMode: "setContentOnly",
    toMountMode: "contentEl",
    label: "setContentOnly -> contentEl",
  },
]

const makeAppliedOutcome = (): ExecuteIntentOutcome => ({
  status: "applied",
  attempts: 1,
})

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

const makeGroupNode = (
  groupId: string,
  children: readonly LayerNode[],
  isExpanded = true,
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: children.flatMap((child) => child.elementIds),
  primaryElementId: children[0]?.primaryElementId ?? `group-primary:${groupId}`,
  children,
  canExpand: true,
  isExpanded,
  groupId,
  frameId: null,
  label: groupId,
})

const makeUiActions = (
  overrides: Partial<LayerManagerUiActions> = {},
): {
  readonly actions: LayerManagerUiActions
  readonly commandSpies: LayerManagerUiActions["commands"]
} => {
  const commandSpies = {
    toggleVisibility: vi.fn(async () => makeAppliedOutcome()),
    toggleLock: vi.fn(async () => makeAppliedOutcome()),
    renameNode: vi.fn(async () => makeAppliedOutcome()),
    deleteNode: vi.fn(async () => makeAppliedOutcome()),
    createGroup: vi.fn(async () => makeAppliedOutcome()),
    reorder: vi.fn(async () => makeAppliedOutcome()),
    reparent: vi.fn(async () => makeAppliedOutcome()),
  } satisfies LayerManagerUiActions["commands"]

  const actions: LayerManagerUiActions = {
    beginInteraction: vi.fn(),
    endInteraction: vi.fn(),
    toggleExpanded: vi.fn(),
    toggleVisibilityNode: vi.fn(async () => makeAppliedOutcome()),
    toggleLockNode: vi.fn(async () => makeAppliedOutcome()),
    renameNode: vi.fn(async () => makeAppliedOutcome()),
    deleteNode: vi.fn(async () => makeAppliedOutcome()),
    createGroupFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    reorderFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    reparentFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    commands: commandSpies,
    ...overrides,
  }

  return {
    actions,
    commandSpies,
  }
}

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

const findButtonWithPrefix = (root: FakeDomElement, prefix: string): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find(
    (element) =>
      element.tagName === "BUTTON" &&
      typeof element.textContent === "string" &&
      element.textContent.startsWith(prefix),
  )
}

const findButtonByExactText = (root: FakeDomElement, label: string): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "BUTTON" && element.textContent === label)
}

const findButtonByTitle = (root: FakeDomElement, title: string): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "BUTTON" && element.title === title)
}

const findFirstInput = (root: FakeDomElement): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "INPUT")
}

const findFirstSelect = (root: FakeDomElement): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "SELECT")
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

interface DispatchKeydownOptions {
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  eventTarget?: FakeDomElement
}

const dispatchKeydown = (
  receiver: FakeDomElement,
  key: string,
  options: DispatchKeydownOptions = {},
): void => {
  const init: FakeDomEventInit = {
    key,
  }

  if (options.ctrlKey !== undefined) {
    init.ctrlKey = options.ctrlKey
  }

  if (options.metaKey !== undefined) {
    init.metaKey = options.metaKey
  }

  if (options.altKey !== undefined) {
    init.altKey = options.altKey
  }

  if (options.shiftKey !== undefined) {
    init.shiftKey = options.shiftKey
  }

  const event = new FakeDomEvent("keydown", init)

  if (options.eventTarget) {
    event.target = options.eventTarget as unknown as EventTarget
  }

  receiver.dispatchEvent(event)
}

const dispatchDocumentKeydown = (
  receiver: FakeDocument,
  key: string,
  options: DispatchKeydownOptions = {},
): void => {
  const init: FakeDomEventInit = {
    key,
  }

  if (options.ctrlKey !== undefined) {
    init.ctrlKey = options.ctrlKey
  }

  if (options.metaKey !== undefined) {
    init.metaKey = options.metaKey
  }

  if (options.altKey !== undefined) {
    init.altKey = options.altKey
  }

  if (options.shiftKey !== undefined) {
    init.shiftKey = options.shiftKey
  }

  const event = new FakeDomEvent("keydown", init)

  if (options.eventTarget) {
    event.target = options.eventTarget as unknown as EventTarget
  }

  receiver.dispatchEvent(event)
}

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | null = null
  let rejectPromise: ((reason?: unknown) => void) | null = null

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  return {
    promise,
    resolve: (value) => {
      resolvePromise?.(value)
    },
    reject: (reason) => {
      rejectPromise?.(reason)
    },
  }
}

interface RuntimeWithSidepanel {
  readonly ea: EaLike
  readonly elements: RawExcalidrawElement[]
  readonly sidepanelTab: SidepanelTabHarness
  readonly copyForEditing: ReturnType<typeof vi.fn>
  readonly addToView: ReturnType<typeof vi.fn>
  readonly updateScene: ReturnType<typeof vi.fn>
  readonly selectInView: ReturnType<typeof vi.fn>
  readonly setView: ReturnType<typeof vi.fn>
  readonly setSelectedIds: (ids: readonly string[]) => void
  readonly clearViewBinding: () => void
  readonly scheduleSceneDriftBeforeGetViewElementsCall: (
    element: RawExcalidrawElement,
    callIndex: number,
  ) => void
  readonly emitSceneChange: (appState?: unknown) => void
  readonly appendElementAndEmitSceneChange: (element: RawExcalidrawElement) => void
}

interface MakeRuntimeWithSidepanelOptions {
  readonly failFirstGetElementIds?: readonly string[]
  readonly tabMountMode?: SidepanelMountMode
  readonly disableElementEditCapabilities?: boolean
  readonly requireSetViewForSelectionReads?: boolean
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
  const failFirstGetElementIds = new Set(options.failFirstGetElementIds ?? [])
  const sidepanelTab = makeSidepanelTabForMountMode(
    document,
    null,
    options.tabMountMode ?? "contentEl",
  )

  let scheduledSceneDrift: {
    element: RawExcalidrawElement
    injectOnCall: number
    callCount: number
  } | null = null

  let viewBound = options.requireSetViewForSelectionReads !== true

  const setView = vi.fn(() => {
    viewBound = true
    return {
      id: "fake-view",
    }
  })

  const clearViewBinding = (): void => {
    viewBound = false
  }

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

  const scheduleSceneDriftBeforeGetViewElementsCall = (
    element: RawExcalidrawElement,
    callIndex: number,
  ): void => {
    scheduledSceneDrift = {
      element: cloneElement(element),
      injectOnCall: Math.max(1, callIndex),
      callCount: 0,
    }
  }

  let editableById = new Map<string, RawExcalidrawElement>()
  const sceneChangeListeners = new Set<
    (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
  >()

  const emitSceneChange = (appState: unknown = {}): void => {
    const snapshot = elements.map(cloneElement)
    for (const listener of [...sceneChangeListeners]) {
      listener(snapshot, appState, {})
    }
  }

  const appendElementAndEmitSceneChange = (element: RawExcalidrawElement): void => {
    const exists = elements.some((entry) => entry.id === element.id)
    if (!exists) {
      elements.push(cloneElement(element))
    }

    emitSceneChange()
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

  const selectInView = vi.fn((ids: readonly string[]) => {
    if (options.requireSetViewForSelectCalls === true && !viewBound) {
      throw new Error("targetView not set")
    }

    setSelectedIds(ids)
  })

  const ea: EaLike = {
    setView,
    getViewElements: () => {
      if (!viewBound) {
        throw new Error("targetView not set")
      }

      const drift = scheduledSceneDrift
      if (drift) {
        drift.callCount += 1

        if (drift.callCount >= drift.injectOnCall) {
          const hasElement = elements.some((element) => element.id === drift.element.id)

          if (!hasElement) {
            elements.push(cloneElement(drift.element))
          }

          scheduledSceneDrift = null
        }
      }

      return elements
    },
    getViewSelectedElements: () => {
      if (!viewBound) {
        throw new Error("targetView not set")
      }

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

  if (!options.disableElementEditCapabilities) {
    ea.copyViewElementsToEAforEditing = copyForEditing
    ea.getElement = (id: string) => {
      if (failFirstGetElementIds.has(id)) {
        failFirstGetElementIds.delete(id)
        return undefined
      }

      return editableById.get(id)
    }
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
    selectInView,
    setView,
    setSelectedIds,
    clearViewBinding,
    scheduleSceneDriftBeforeGetViewElementsCall,
    emitSceneChange,
    appendElementAndEmitSceneChange,
  }
}

const getContentRoot = (contentEl: FakeDomElement): FakeDomElement => {
  const root = contentEl.children[0]
  if (!root) {
    throw new Error("Expected sidepanel content root to exist.")
  }

  return root
}

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

describe("sidepanel keyboard + lifecycle parity", () => {
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

  it("keyboard shortcut brings selected elements to front through the sidepanel seam", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle" },
        { id: "B", type: "rectangle" },
        { id: "C", type: "rectangle" },
      ],
      ["A", "C"],
    )

    createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "A", "C"])
  })

  it("supports render + keyboard parity when sidepanel tabs only expose setContent", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle" },
        { id: "B", type: "rectangle" },
        { id: "C", type: "rectangle" },
      ],
      ["A", "C"],
      {
        tabMountMode: "setContentOnly",
      },
    )

    createLayerManagerRuntime(runtime.ea)

    expect(runtime.sidepanelTab.setContent).toHaveBeenCalled()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "A", "C"])
  })

  it("rebinds Excalidraw view context on startup before snapshot reads", () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", isDeleted: false }],
      [],
      {
        requireSetViewForSelectionReads: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)

    expect(runtime.setView).toHaveBeenCalled()
    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(contentRoot).toBeDefined()
  })

  it("refreshes runtime snapshot on external Excalidraw onChange events", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", isDeleted: false }],
      [],
    )

    const app = createLayerManagerRuntime(runtime.ea)

    expect(app.getSnapshot().elements.some((element) => element.id === "C")).toBe(false)

    runtime.appendElementAndEmitSceneChange({
      id: "C",
      type: "rectangle",
      isDeleted: false,
    })

    await flushAsync()

    expect(app.getSnapshot().elements.some((element) => element.id === "C")).toBe(true)
  })

  it("retries onChange subscription on refresh when host exposes it late", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", isDeleted: false }],
      [],
    )

    const externalListeners = new Set<
      (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
    >()

    let exposeOnChange = false

    runtime.ea.getExcalidrawAPI = () => {
      if (!exposeOnChange) {
        return {
          updateScene: runtime.updateScene,
        }
      }

      return {
        updateScene: runtime.updateScene,
        onChange: (callback) => {
          externalListeners.add(callback)
          return () => {
            externalListeners.delete(callback)
          }
        },
      }
    }

    const app = createLayerManagerRuntime(runtime.ea)

    exposeOnChange = true
    app.refresh()

    runtime.elements.push({ id: "C", type: "rectangle", isDeleted: false })
    for (const listener of [...externalListeners]) {
      listener(runtime.elements, {}, {})
    }

    await flushAsync()

    expect(app.getSnapshot().elements.some((element) => element.id === "C")).toBe(true)
  })

  it("keeps render stable when view rebinding cannot be confirmed and live-selection read throws", () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const getViewSelectedElements = vi.fn(() => {
      throw new Error("targetView not set")
    })

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      targetView: null,
      setView: vi.fn(() => null),
      getViewSelectedElements,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A")],
      selectedIds: new Set(["A"]),
      sceneVersion: 1,
    })

    expect(getViewSelectedElements).toHaveBeenCalledTimes(1)
  })

  it("autofocuses sidepanel content root on initial mount and after close/reopen", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", isDeleted: false }],
      [],
    )

    const layerManagerRuntime = createLayerManagerRuntime(runtime.ea)

    const firstRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(fakeDocument.activeElement).toBe(firstRoot)

    const closeButton = findButtonByExactText(firstRoot, "Close tab")
    if (!closeButton) {
      throw new Error("Expected close button to exist for sidepanel renderer.")
    }

    closeButton.click()
    await flushAsync()

    layerManagerRuntime.refresh()

    const secondRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(secondRoot).not.toBe(firstRoot)
    expect(fakeDocument.activeElement).toBe(secondRoot)
  })

  it("switches row visibility action icon/title for hidden node state", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", isDeleted: false }],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const hideButton = findButtonByTitle(contentRoot, "Hide layer")

    if (!hideButton) {
      throw new Error("Expected row visibility action button to exist.")
    }

    hideButton.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findButtonByTitle(contentRoot, "Show layer")).toBeDefined()
  })

  it("routes Delete shortcut through command seam for selected elements", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      ["A"],
    )

    createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Delete")
    await flushAsync()

    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(true)
    expect(runtime.elements.find((element) => element.id === "B")?.isDeleted).toBe(false)
  })

  it("extends keyboard selection with Shift+Arrow and groups selected rows with G", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "C", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
        { id: "A", type: "rectangle", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown", { shiftKey: true })
    await flushAsync()

    expect(runtime.selectInView).toHaveBeenCalledTimes(1)
    expect(runtime.selectInView.mock.calls[0]?.[0]).toEqual(["A", "B"])

    dispatchKeydown(contentRoot, "g")
    await flushAsync()

    const groupA = runtime.elements.find((element) => element.id === "A")?.groupIds ?? []
    const groupB = runtime.elements.find((element) => element.id === "B")?.groupIds ?? []
    const groupC = runtime.elements.find((element) => element.id === "C")?.groupIds ?? []

    expect(groupA.length).toBeGreaterThan(0)
    expect(groupB).toEqual(groupA)
    expect(groupC).toEqual([])
  })

  it("falls back to updateScene for keyboard delete when legacy edit APIs are unavailable", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      ["A"],
      {
        disableElementEditCapabilities: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Delete")
    await flushAsync()

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(true)
    expect(runtime.elements.find((element) => element.id === "B")?.isDeleted).toBe(false)
  })

  it("falls back to updateScene for keyboard inline rename when legacy edit APIs are unavailable", async () => {
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
    dispatchKeydown(contentRoot, "Enter")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input to exist after pressing Enter.")
    }

    input.value = "Renamed with fallback"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")
    await flushAsync()

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.find((element) => element.id === "A")?.name).toBe(
      "Renamed with fallback",
    )
  })

  it("keeps focused-row keyboard navigation usable after inline rename commit", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", name: "Old name" },
        { id: "B", type: "rectangle" },
        { id: "C", type: "rectangle" },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Enter")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input to exist after pressing Enter.")
    }

    input.value = "Renamed focus"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")
    await flushAsync()

    expect(runtime.elements.some((element) => element.name === "Renamed focus")).toBe(true)

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const rowsBeforeArrow = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const focusedIndexBeforeArrow = rowsBeforeArrow.findIndex(
      (element) => (element.style["outline"]?.length ?? 0) > 0,
    )

    expect(focusedIndexBeforeArrow).toBeGreaterThanOrEqual(0)

    const moveKey = focusedIndexBeforeArrow >= rowsBeforeArrow.length - 1 ? "ArrowUp" : "ArrowDown"

    dispatchKeydown(contentRoot, moveKey)
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const rowsAfterArrow = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const focusedIndexAfterArrow = rowsAfterArrow.findIndex(
      (element) => (element.style["outline"]?.length ?? 0) > 0,
    )

    expect(focusedIndexAfterArrow).toBeGreaterThanOrEqual(0)
    expect(focusedIndexAfterArrow).not.toBe(focusedIndexBeforeArrow)
  })

  it("keeps document-level keyboard routing active after inline rename blur transition", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", name: "Old name" },
        { id: "B", type: "rectangle" },
        { id: "C", type: "rectangle" },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Enter")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input to exist after pressing Enter.")
    }

    input.value = "Renamed document route"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")

    const outsideTarget = fakeDocument.createElement("div")
    fakeDocument.activeElement = outsideTarget

    const focusOutEvent = new FakeDomEvent("focusout")
    ;(focusOutEvent as unknown as { relatedTarget?: EventTarget | null }).relatedTarget =
      outsideTarget as unknown as EventTarget

    contentRoot.dispatchEvent(focusOutEvent)
    await flushAsync()

    expect(runtime.elements.some((element) => element.name === "Renamed document route")).toBe(true)

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const rowsBeforeArrow = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const focusedIndexBeforeArrow = rowsBeforeArrow.findIndex(
      (element) => (element.style["outline"]?.length ?? 0) > 0,
    )

    expect(focusedIndexBeforeArrow).toBeGreaterThanOrEqual(0)

    const moveKey = focusedIndexBeforeArrow >= rowsBeforeArrow.length - 1 ? "ArrowUp" : "ArrowDown"

    dispatchDocumentKeydown(fakeDocument, moveKey, { eventTarget: outsideTarget })
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(fakeDocument.activeElement).toBe(contentRoot)

    const rowsAfterArrow = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const focusedIndexAfterArrow = rowsAfterArrow.findIndex(
      (element) => (element.style["outline"]?.length ?? 0) > 0,
    )

    expect(focusedIndexAfterArrow).toBeGreaterThanOrEqual(0)
    expect(focusedIndexAfterArrow).not.toBe(focusedIndexBeforeArrow)

    dispatchDocumentKeydown(fakeDocument, "Enter", { eventTarget: outsideTarget })
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findFirstInput(contentRoot)).toBeDefined()
  })

  it("keeps keyboard routing continuity after row-action rename blur transition", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", name: "Old name" },
        { id: "B", type: "rectangle" },
        { id: "C", type: "rectangle" },
      ],
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

    input.value = "Renamed from row action route"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")

    const outsideTarget = fakeDocument.createElement("div")
    fakeDocument.activeElement = outsideTarget

    const focusOutEvent = new FakeDomEvent("focusout")
    ;(focusOutEvent as unknown as { relatedTarget?: EventTarget | null }).relatedTarget =
      outsideTarget as unknown as EventTarget

    contentRoot.dispatchEvent(focusOutEvent)
    await flushAsync()

    expect(
      runtime.elements.some((element) => element.name === "Renamed from row action route"),
    ).toBe(true)

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const rowsBeforeArrow = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const focusedIndexBeforeArrow = rowsBeforeArrow.findIndex(
      (element) => (element.style["outline"]?.length ?? 0) > 0,
    )

    expect(focusedIndexBeforeArrow).toBeGreaterThanOrEqual(0)

    const moveKey = focusedIndexBeforeArrow >= rowsBeforeArrow.length - 1 ? "ArrowUp" : "ArrowDown"

    dispatchDocumentKeydown(fakeDocument, moveKey, { eventTarget: outsideTarget })
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(fakeDocument.activeElement).toBe(contentRoot)

    const rowsAfterArrow = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const focusedIndexAfterArrow = rowsAfterArrow.findIndex(
      (element) => (element.style["outline"]?.length ?? 0) > 0,
    )

    expect(focusedIndexAfterArrow).toBeGreaterThanOrEqual(0)
    expect(focusedIndexAfterArrow).not.toBe(focusedIndexBeforeArrow)
  })

  it("keeps Shift+Arrow selection extension usable when host selection bridge is unavailable", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "C", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
        { id: "A", type: "rectangle", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)
    Reflect.deleteProperty(runtime.ea, "selectElementsInView")

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const firstRow = findInteractiveRowByLabel(contentRoot, "[element]")
    if (!firstRow) {
      throw new Error("Expected at least one interactive row for shift-selection fallback test.")
    }

    firstRow.click()
    await flushAsync()

    dispatchKeydown(contentRoot, "ArrowDown", { shiftKey: true })
    await flushAsync()

    dispatchKeydown(contentRoot, "g")
    await flushAsync()

    const groupA = runtime.elements.find((element) => element.id === "A")?.groupIds ?? []
    const groupB = runtime.elements.find((element) => element.id === "B")?.groupIds ?? []
    const groupC = runtime.elements.find((element) => element.id === "C")?.groupIds ?? []

    expect(groupA.length).toBeGreaterThan(0)
    expect(groupB).toEqual(groupA)
    expect(groupC).toEqual([])
  })

  it("falls back to updateScene for keyboard ungroup-like when legacy edit APIs are unavailable", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", groupIds: ["G"] }],
      ["A"],
      {
        disableElementEditCapabilities: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "u")
    await flushAsync()

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.find((element) => element.id === "A")?.groupIds ?? []).toEqual([])
  })

  it("syncs keyboard selection from live host state before executing shortcuts", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    runtime.setSelectedIds(["B"])

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Delete")
    await flushAsync()

    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).toHaveBeenCalledTimes(1)
    expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(false)
    expect(runtime.elements.find((element) => element.id === "B")?.isDeleted).toBe(true)
  })

  it("suppresses immediate keyboard shortcuts right after prompt interactions", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", isDeleted: false, name: "old" }],
      ["A"],
    )

    createLayerManagerRuntime(runtime.ea)

    const previousPrompt = globalRecord["prompt"]
    const nowSpy = vi.spyOn(Date, "now")
    let now = 10_000

    nowSpy.mockImplementation(() => now)
    globalRecord["prompt"] = vi
      .fn()
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")
      .mockReturnValueOnce("")

    try {
      const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      const reparentButton = findButtonByExactText(contentRoot, "Reparent selected")
      if (!reparentButton) {
        throw new Error("Expected reparent toolbar button to exist.")
      }

      reparentButton.click()
      await flushAsync()

      dispatchKeydown(contentRoot, "Delete")
      await flushAsync()

      expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(false)

      now += 500

      dispatchKeydown(contentRoot, "Delete")
      await flushAsync()

      expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(true)
    } finally {
      globalRecord["prompt"] = previousPrompt
      nowSpy.mockRestore()
    }
  })

  it("defers keyboard-triggered command writes until interaction lifecycle is idle", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle" },
        { id: "B", type: "rectangle" },
        { id: "C", type: "rectangle" },
      ],
      ["A"],
    )

    const app = createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)

    app.beginInteraction()

    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()

    app.endInteraction()
    await flushAsync()

    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "C", "A"])
  })

  it("falls back to updateScene when keyboard delete legacy edit lookup fails under interaction gating", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", isDeleted: false },
        { id: "B", type: "rectangle", isDeleted: false },
      ],
      ["A"],
      {
        failFirstGetElementIds: ["A"],
      },
    )

    const app = createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)

    app.beginInteraction()

    dispatchKeydown(contentRoot, "Delete")
    await flushAsync()

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
    expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(false)

    app.endInteraction()
    await flushAsync()
    await flushAsync()

    expect(runtime.copyForEditing).toHaveBeenCalledTimes(1)
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.find((element) => element.id === "A")?.isDeleted).toBe(true)
    expect(runtime.elements.find((element) => element.id === "B")?.isDeleted).toBe(false)
  })

  it("keeps keyboard reorder retry bounded after interaction-gated stale apply recovery", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle" },
        { id: "B", type: "rectangle" },
        { id: "C", type: "rectangle" },
      ],
      ["A"],
    )

    const app = createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)

    app.beginInteraction()
    runtime.scheduleSceneDriftBeforeGetViewElementsCall(
      {
        id: "D",
        type: "rectangle",
      },
      3,
    )

    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()

    app.endInteraction()
    await flushAsync()

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "C", "D", "A"])
  })

  it("covers supported shortcut behavior with a compact keyboard matrix", async () => {
    interface ShortcutMatrixCase {
      readonly name: string
      readonly selectedIds: readonly string[]
      readonly buildTree: () => readonly LayerNode[]
      readonly dispatch: (contentRoot: FakeDomElement) => void
      readonly assert: (input: {
        readonly actions: LayerManagerUiActions
        readonly commandSpies: LayerManagerUiActions["commands"]
      }) => void
    }

    const shortcutCases: readonly ShortcutMatrixCase[] = [
      {
        name: "ArrowDown focuses the next visible row",
        selectedIds: [],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "ArrowDown")
          dispatchKeydown(contentRoot, "f")
        },
        assert: ({ actions }) => {
          expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:B"])
        },
      },
      {
        name: "ArrowUp returns focus to the previous visible row",
        selectedIds: [],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "ArrowDown")
          dispatchKeydown(contentRoot, "ArrowUp")
          dispatchKeydown(contentRoot, "f")
        },
        assert: ({ actions }) => {
          expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"])
        },
      },
      {
        name: "ArrowRight expands collapsed groups",
        selectedIds: [],
        buildTree: () => [makeGroupNode("Outer", [makeElementNode("Child")], false)],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "ArrowRight")
        },
        assert: ({ actions }) => {
          expect(actions.toggleExpanded).toHaveBeenCalledWith("group:Outer")
        },
      },
      {
        name: "ArrowLeft collapses expanded groups",
        selectedIds: [],
        buildTree: () => [makeGroupNode("Outer", [makeElementNode("Child")], true)],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "ArrowLeft")
        },
        assert: ({ actions }) => {
          expect(actions.toggleExpanded).toHaveBeenCalledWith("group:Outer")
        },
      },
      {
        name: "Enter renames the focused row",
        selectedIds: [],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "Enter")
          const input = findFirstInput(contentRoot)
          if (!input) {
            throw new Error("Expected inline rename input in keyboard matrix case.")
          }

          input.value = "Renamed from matrix"
          input.dispatchEvent(new FakeDomEvent("input"))
          dispatchKeydown(input, "Enter")
        },
        assert: ({ actions }) => {
          expect(actions.renameNode).toHaveBeenCalledWith("el:A", "Renamed from matrix")
          expect(actions.beginInteraction).not.toHaveBeenCalled()
          expect(actions.endInteraction).not.toHaveBeenCalled()
        },
      },
      {
        name: "Delete removes selected elements",
        selectedIds: ["A"],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "Delete")
        },
        assert: ({ commandSpies }) => {
          expect(commandSpies.deleteNode).toHaveBeenCalledWith({
            elementIds: ["A"],
          })
        },
      },
      {
        name: "F brings selected elements to the front",
        selectedIds: ["A"],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "f")
        },
        assert: ({ commandSpies }) => {
          expect(commandSpies.reorder).toHaveBeenCalledWith({
            orderedElementIds: ["A"],
          })
        },
      },
      {
        name: "G groups selected elements",
        selectedIds: ["A", "B"],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "g")
        },
        assert: ({ commandSpies }) => {
          expect(commandSpies.createGroup).toHaveBeenCalledWith({
            elementIds: ["A", "B"],
          })
        },
      },
      {
        name: "U performs ungroup-like move to root",
        selectedIds: ["A"],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "u")
        },
        assert: ({ commandSpies }) => {
          expect(commandSpies.reparent).toHaveBeenCalledWith({
            elementIds: ["A"],
            sourceGroupId: null,
            targetParentPath: [],
            targetFrameId: null,
          })
        },
      },
    ]

    for (const [index, testCase] of shortcutCases.entries()) {
      const sidepanelTab = makeSidepanelTab(fakeDocument, null)
      const { actions, commandSpies } = makeUiActions()

      const renderer = createExcalidrawSidepanelRenderer({
        sidepanelTab: sidepanelTab.tab,
        getScriptSettings: () => ({}),
      })

      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: testCase.buildTree(),
        selectedIds: new Set(testCase.selectedIds),
        sceneVersion: 20 + index,
        actions,
      })

      const contentRoot = getContentRoot(sidepanelTab.contentEl)

      testCase.dispatch(contentRoot)
      await flushAsync()

      testCase.assert({
        actions,
        commandSpies,
      })
    }
  })

  it("keeps async tab creation in-flight without fallback warning spam or duplicate create requests", async () => {
    const asyncTab = makeSidepanelTab(fakeDocument, null)
    const deferredTab = createDeferred<typeof asyncTab.tab>()

    const host: {
      sidepanelTab: typeof asyncTab.tab | null
      createSidepanelTab: ReturnType<typeof vi.fn>
      getScriptSettings: () => ScriptSettings
    } = {
      sidepanelTab: null,
      createSidepanelTab: vi.fn(() => deferredTab.promise),
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

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 2,
      })

      expect(host.createSidepanelTab).toHaveBeenCalledTimes(1)
      expect(host.sidepanelTab).toBeNull()
      expect(logSpy).not.toHaveBeenCalledWith(
        "[LMX] Layer Manager sidepanel unavailable in this host. Falling back to console renderer.",
      )

      deferredTab.resolve(asyncTab.tab)
      await flushAsync()

      expect(host.sidepanelTab).toBe(asyncTab.tab)
      expect(asyncTab.setTitle).toHaveBeenCalledWith("Layer Manager")
      expect(asyncTab.open).toHaveBeenCalledTimes(1)
      expect(asyncTab.contentEl.children.length).toBeGreaterThan(0)
    } finally {
      logSpy.mockRestore()
    }
  })

  it("recovers when setContent mount throws once and succeeds on retry", async () => {
    const contentEl = fakeDocument.createElement("div")
    const setTitle = vi.fn()
    const open = vi.fn()
    const close = vi.fn()

    let shouldThrowOnFirstSetContent = true
    const setContent = vi.fn((content: HTMLElement | string) => {
      if (shouldThrowOnFirstSetContent) {
        shouldThrowOnFirstSetContent = false
        throw new Error("setContent failed once")
      }

      contentEl.innerHTML = ""

      if (typeof content === "string") {
        contentEl.innerHTML = content
        return
      }

      contentEl.appendChild(content as unknown as FakeDomElement)
    })

    const tab = {
      setTitle,
      open,
      close,
      getHostEA: () => null,
      setContent,
    }

    const host = {
      sidepanelTab: tab,
      getScriptSettings: () => ({}),
    }

    const { actions } = makeUiActions()
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
        actions,
      })

      await flushAsync()

      expect(setContent).toHaveBeenCalledTimes(1)
      expect(contentEl.children.length).toBe(0)
      expect(logSpy).toHaveBeenCalledWith(
        "[LMX] Failed to attach Layer Manager content to sidepanel tab.",
      )

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 2,
        actions,
      })

      await flushAsync()

      expect(setContent).toHaveBeenCalledTimes(2)
      expect(contentEl.children.length).toBeGreaterThan(0)

      const contentRoot = getContentRoot(contentEl)
      dispatchKeydown(contentRoot, "f")
      await flushAsync()

      expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"])
    } finally {
      logSpy.mockRestore()
    }
  })

  for (const mountCase of SIDEPANEL_MOUNT_MODE_CASES) {
    it(`mount parity (${mountCase.label}): close/reopen clears stale keyboard root and rebinds once`, async () => {
      const sidepanelTab = makeSidepanelTabForMountMode(fakeDocument, null, mountCase.mountMode)
      const createSidepanelTab = vi.fn(() => sidepanelTab.tab)

      const host: {
        sidepanelTab: typeof sidepanelTab.tab | null
        createSidepanelTab: () => typeof sidepanelTab.tab
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: null,
        createSidepanelTab,
        getScriptSettings: () => ({}),
      }

      const { actions } = makeUiActions()

      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
        actions,
      })

      expectMountedOutputForMode(sidepanelTab, mountCase.mountMode)

      const firstRoot = getContentRoot(sidepanelTab.contentEl)
      const closeButton = findButtonByExactText(firstRoot, "Close tab")
      if (!closeButton) {
        throw new Error("Expected close button to exist for sidepanel renderer.")
      }

      closeButton.click()
      await flushAsync()

      expect(host.sidepanelTab).toBeNull()

      dispatchKeydown(firstRoot, "f")
      await flushAsync()
      expect(actions.reorderFromNodeIds).not.toHaveBeenCalled()

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 2,
        actions,
      })

      expectMountedOutputForMode(sidepanelTab, mountCase.mountMode)

      const secondRoot = getContentRoot(sidepanelTab.contentEl)
      expect(secondRoot).not.toBe(firstRoot)

      dispatchKeydown(secondRoot, "f")
      await flushAsync()

      expect(createSidepanelTab).toHaveBeenCalledTimes(2)
      expect(actions.reorderFromNodeIds).toHaveBeenCalledTimes(1)
      expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"])
    })
  }

  for (const transitionCase of SIDEPANEL_MOUNT_TRANSITION_CASES) {
    it(`mount transition parity (${transitionCase.label}): close/reopen reattaches deterministically`, async () => {
      const firstTab = makeSidepanelTabForMountMode(
        fakeDocument,
        null,
        transitionCase.fromMountMode,
      )
      const secondTab = makeSidepanelTabForMountMode(fakeDocument, null, transitionCase.toMountMode)

      const queuedTabs = [firstTab.tab, secondTab.tab]
      const createSidepanelTab = vi.fn(() => {
        const nextTab = queuedTabs.shift()
        if (!nextTab) {
          throw new Error("Expected queued sidepanel tab for mount transition test.")
        }

        return nextTab
      })

      const host: {
        sidepanelTab: typeof firstTab.tab | typeof secondTab.tab | null
        createSidepanelTab: () => typeof firstTab.tab | typeof secondTab.tab
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: null,
        createSidepanelTab,
        getScriptSettings: () => ({}),
      }

      const { actions } = makeUiActions()

      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
        actions,
      })

      expect(host.sidepanelTab).toBe(firstTab.tab)
      expectMountedOutputForMode(firstTab, transitionCase.fromMountMode)

      const firstRoot = getContentRoot(firstTab.contentEl)
      const closeButton = findButtonByExactText(firstRoot, "Close tab")
      if (!closeButton) {
        throw new Error("Expected close button to exist for sidepanel renderer.")
      }

      closeButton.click()
      await flushAsync()

      expect(host.sidepanelTab).toBeNull()

      dispatchKeydown(firstRoot, "f")
      await flushAsync()
      expect(actions.reorderFromNodeIds).not.toHaveBeenCalled()

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 2,
        actions,
      })

      expect(host.sidepanelTab).toBe(secondTab.tab)
      expectMountedOutputForMode(secondTab, transitionCase.toMountMode)

      const secondRoot = getContentRoot(secondTab.contentEl)
      expect(secondRoot).not.toBe(firstRoot)

      dispatchKeydown(secondRoot, "f")
      await flushAsync()

      expect(createSidepanelTab).toHaveBeenCalledTimes(2)
      expect(actions.reorderFromNodeIds).toHaveBeenCalledTimes(1)
      expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"])
    })
  }

  for (const transitionCase of SIDEPANEL_MOUNT_TRANSITION_CASES) {
    it(`mount transition parity (${transitionCase.label}): stale host tab invalidation reattaches deterministically`, async () => {
      const firstTab = makeSidepanelTabForMountMode(
        fakeDocument,
        null,
        transitionCase.fromMountMode,
      )
      const secondTab = makeSidepanelTabForMountMode(fakeDocument, null, transitionCase.toMountMode)

      const staleHostTab = {
        setTitle: vi.fn(),
        open: vi.fn(),
        close: vi.fn(),
        getHostEA: () => null,
      }

      const createSidepanelTab = vi.fn(() => secondTab.tab)

      const host: {
        sidepanelTab: typeof firstTab.tab | typeof secondTab.tab | typeof staleHostTab | null
        createSidepanelTab: () => typeof secondTab.tab
        getScriptSettings: () => ScriptSettings
      } = {
        sidepanelTab: firstTab.tab,
        createSidepanelTab,
        getScriptSettings: () => ({}),
      }

      const { actions } = makeUiActions()

      const renderer = createExcalidrawSidepanelRenderer(host)
      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 1,
        actions,
      })

      expectMountedOutputForMode(firstTab, transitionCase.fromMountMode)
      expect(createSidepanelTab).not.toHaveBeenCalled()

      const firstRoot = getContentRoot(firstTab.contentEl)
      host.sidepanelTab = staleHostTab

      renderer.render({
        tree: [makeElementNode("A")],
        selectedIds: new Set(),
        sceneVersion: 2,
        actions,
      })

      expect(createSidepanelTab).toHaveBeenCalledTimes(1)
      expect(host.sidepanelTab).toBe(secondTab.tab)
      expectMountedOutputForMode(secondTab, transitionCase.toMountMode)

      dispatchKeydown(firstRoot, "f")
      await flushAsync()
      expect(actions.reorderFromNodeIds).not.toHaveBeenCalled()

      const secondRoot = getContentRoot(secondTab.contentEl)
      expect(secondRoot).not.toBe(firstRoot)

      dispatchKeydown(secondRoot, "f")
      await flushAsync()

      expect(actions.reorderFromNodeIds).toHaveBeenCalledTimes(1)
      expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"])
    })
  }

  for (const mountCase of SIDEPANEL_MOUNT_MODE_CASES) {
    it(`mount parity (${mountCase.label}): keyboard reorder through runtime`, async () => {
      const runtime = makeRuntimeWithSidepanel(
        fakeDocument,
        [
          { id: "A", type: "rectangle" },
          { id: "B", type: "rectangle" },
          { id: "C", type: "rectangle" },
        ],
        ["A", "C"],
        {
          tabMountMode: mountCase.mountMode,
        },
      )

      createLayerManagerRuntime(runtime.ea)
      expectMountedOutputForMode(runtime.sidepanelTab, mountCase.mountMode)

      const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "f")
      await flushAsync()

      expect(runtime.updateScene).toHaveBeenCalledTimes(1)
      expect(runtime.copyForEditing).not.toHaveBeenCalled()
      expect(runtime.addToView).not.toHaveBeenCalled()
      expect(runtime.elements.map((element) => element.id)).toEqual(["B", "A", "C"])
    })
  }

  it("keeps quick-move root/dropdown controls and toolbar actions wired after quick-move composition changes", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions, commandSpies } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [
        makeElementNode("A"),
        makeGroupNode("G1", [makeElementNode("B")]),
        makeGroupNode("G2", [makeElementNode("C")]),
        makeGroupNode("G3", [makeElementNode("D")]),
        makeGroupNode("G4", [makeElementNode("E")]),
        makeGroupNode("G5", [makeElementNode("F")]),
      ],
      selectedIds: new Set(["A"]),
      sceneVersion: 12,
      actions,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const rootButton = findButtonByExactText(contentRoot, "Root")
    const moveButton = findButtonByExactText(contentRoot, "Move")
    const presetSelect = findFirstSelect(contentRoot)

    if (!rootButton || !moveButton || !presetSelect) {
      throw new Error("Expected quick-move root/dropdown controls to exist.")
    }

    const reorderButton = findButtonByExactText(contentRoot, "Bring selected to front")
    if (!reorderButton) {
      throw new Error("Expected toolbar reorder button to exist.")
    }

    reorderButton.click()
    await flushAsync()

    expect(commandSpies.reorder).toHaveBeenCalledWith({
      orderedElementIds: ["A"],
    })

    rootButton.click()
    await flushAsync()

    expect(commandSpies.reparent).toHaveBeenCalledWith({
      elementIds: ["A"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: null,
    })

    const firstPresetOption = presetSelect.children.find(
      (child) => child.tagName === "OPTION" && child.value.length > 0,
    )

    if (!firstPresetOption) {
      throw new Error("Expected at least one selectable quick-move preset option.")
    }

    presetSelect.value = firstPresetOption.value
    presetSelect.dispatchEvent(new FakeDomEvent("change"))
    moveButton.click()
    await flushAsync()

    const reparentMock = vi.mocked(commandSpies.reparent)
    const latestReparentCall = reparentMock.mock.calls.at(-1)?.[0] as
      | {
          readonly elementIds: readonly string[]
          readonly sourceGroupId: string | null
          readonly targetParentPath: readonly string[]
          readonly targetFrameId: string | null
        }
      | undefined

    expect(latestReparentCall?.elementIds).toEqual(["A"])
    expect(latestReparentCall?.sourceGroupId).toBeNull()
    expect(latestReparentCall?.targetParentPath.length ?? 0).toBeGreaterThan(0)
    expect(latestReparentCall?.targetFrameId).toBeNull()
  })

  it("keeps planner-error keyboard path fail-closed with zero writes", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", groupIds: [] },
        { id: "B", type: "rectangle", groupIds: [] },
      ],
      ["A"],
    )

    createLayerManagerRuntime(runtime.ea)

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "g")
    await flushAsync()

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).not.toHaveBeenCalled()
  })
})
