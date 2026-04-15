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

import {
  FakeDocument,
  type FakeDomElement,
  FakeDomEvent,
  SIDEPANEL_MOUNT_MODE_CASES,
  dispatchDocumentKeydown,
  dispatchKeydown,
  findButtonByExactText,
  findButtonByTitle,
  findButtonWithPrefix,
  findFirstInput,
  findFirstSelect,
  findFocusedInteractiveRow,
  findInteractiveRowByLabel,
  findRowFilterInput,
  findRowTreeRoot,
  flattenElements,
  flushAsync,
  getContentRoot,
  makeSidepanelTab,
  makeSidepanelTabForMountMode,
} from "./sidepanelTestHarness.js"
import type { SidepanelMountMode, SidepanelTabHarness } from "./sidepanelTestHarness.js"

const cloneElement = (element: RawExcalidrawElement): RawExcalidrawElement => ({
  ...element,
  groupIds: [...(element.groupIds ?? [])],
  customData: { ...(element.customData ?? {}) },
})

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
    reorderRelativeToNodeIds: vi.fn(async () => makeAppliedOutcome()),
    reparentFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    commands: commandSpies,
    ...overrides,
  }

  return {
    actions,
    commandSpies,
  }
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

  it("keyboard shortcut brings canonical element selection to front through the sidepanel seam", async () => {
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

  it("keeps render stable when view rebinding cannot be confirmed and live-selection read stays unreachable", () => {
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

    expect(getViewSelectedElements).not.toHaveBeenCalled()

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const selectedRows = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && (element.style["background"]?.length ?? 0) > 0,
    )
    expect(selectedRows).toHaveLength(1)
  })

  it("autofocuses sidepanel content root on initial mount and after close/reopen", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", isDeleted: false }],
      [],
    )

    const layerManagerRuntime = createLayerManagerRuntime(runtime.ea)

    const firstRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const firstRowTree = findRowTreeRoot(firstRoot)
    const firstFocusedRow = findFocusedInteractiveRow(firstRoot)
    expect(firstRowTree).toBeDefined()
    expect(firstFocusedRow).toBeDefined()
    expect(fakeDocument.activeElement).toBe(firstRowTree)
    expect(
      (firstRowTree as FakeDomElement & { ariaActivedescendant?: string }).ariaActivedescendant,
    ).toBe((firstFocusedRow as FakeDomElement & { id?: string }).id)

    const closeButton = findButtonByExactText(firstRoot, "Close tab")
    if (!closeButton) {
      throw new Error("Expected close button to exist for sidepanel renderer.")
    }

    closeButton.click()
    await flushAsync()

    layerManagerRuntime.refresh()

    const secondRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const secondRowTree = findRowTreeRoot(secondRoot)
    const secondFocusedRow = findFocusedInteractiveRow(secondRoot)
    expect(secondRoot).not.toBe(firstRoot)
    expect(secondRowTree).toBeDefined()
    expect(secondFocusedRow).toBeDefined()
    expect(fakeDocument.activeElement).toBe(secondRowTree)
    expect(
      (secondRowTree as FakeDomElement & { ariaActivedescendant?: string }).ariaActivedescendant,
    ).toBe((secondFocusedRow as FakeDomElement & { id?: string }).id)
  })

  it("switches row visibility action icon/title for hidden node state", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [{ id: "A", type: "rectangle", isDeleted: false }],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const hideButton = findButtonByTitle(contentRoot, "Hide all items")

    if (!hideButton) {
      throw new Error("Expected row visibility action button to exist.")
    }

    hideButton.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findButtonByTitle(contentRoot, "Show all items")).toBeDefined()
  })

  it("expands collapsed groups from the row toggle button in the live runtime", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "text", text: "Alpha", groupIds: ["G"], isDeleted: false },
        { id: "B", type: "text", text: "Beta", groupIds: ["G"], isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeUndefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Beta")).toBeUndefined()

    const expandButton = findButtonByTitle(contentRoot, "Expand row G")
    if (!expandButton) {
      throw new Error("Expected expand button for collapsed group row.")
    }

    expandButton.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findButtonByTitle(contentRoot, "Collapse row G")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Beta")).toBeDefined()
  })

  it("expands collapsed groups from ArrowRight in the live runtime", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "text", text: "Alpha", groupIds: ["G"], isDeleted: false },
        { id: "B", type: "text", text: "Beta", groupIds: ["G"], isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeUndefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Beta")).toBeUndefined()

    dispatchKeydown(contentRoot, "ArrowRight")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findButtonByTitle(contentRoot, "Collapse row G")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Beta")).toBeDefined()
  })

  it("uses outcome-honest mixed visibility and lock action copy", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeGroupNode("G", [makeElementNode("A"), makeElementNode("B")])],
      selectedIds: new Set(),
      sceneVersion: 10,
      actions,
      elementStateById: new Map([
        ["A", { opacity: 0, locked: true }],
        ["B", { opacity: 100, locked: false }],
      ]),
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    expect(findButtonByTitle(contentRoot, "Show hidden items")).toBeDefined()
    expect(findButtonByTitle(contentRoot, "Lock unlocked items")).toBeDefined()
  })

  it("marks only resolved row targets as aria-selected for host element selection", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeGroupNode("G", [makeElementNode("A"), makeElementNode("B")])],
      selectedIds: new Set(["A"]),
      sceneVersion: 11,
      actions,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const groupRow = findInteractiveRowByLabel(contentRoot, "[group] G")
    const alphaRow = findInteractiveRowByLabel(contentRoot, "[element] A")
    const betaRow = findInteractiveRowByLabel(contentRoot, "[element] B")

    expect(
      (groupRow as (FakeDomElement & { ariaSelected?: string }) | undefined)?.ariaSelected,
    ).toBe("false")
    expect(
      (alphaRow as (FakeDomElement & { ariaSelected?: string }) | undefined)?.ariaSelected,
    ).toBe("true")
    expect(
      (betaRow as (FakeDomElement & { ariaSelected?: string }) | undefined)?.ariaSelected,
    ).toBe("false")
  })

  it("filters rows and surfaces descendant matches from collapsed groups", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "text", text: "Alpha", groupIds: ["G"], isDeleted: false },
        { id: "B", type: "text", text: "Beta", groupIds: ["G"], isDeleted: false },
        { id: "C", type: "rectangle", name: "Gamma", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const searchInput = findRowFilterInput(contentRoot)

    if (!searchInput) {
      throw new Error("Expected row filter input to exist.")
    }

    searchInput.value = "Alpha"
    searchInput.dispatchEvent(new FakeDomEvent("input"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)

    expect(findButtonByExactText(contentRoot, "Clear filter")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[group] G")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Beta")).toBeUndefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Gamma")).toBeUndefined()
    expect(findButtonByExactText(contentRoot, "▾")).toBeUndefined()
    expect(findButtonByExactText(contentRoot, "▸")).toBeUndefined()

    const textFragments = flattenElements(contentRoot)
      .map((element) => element.textContent ?? "")
      .filter((text) => text.length > 0)
    const reviewMoveTitle = flattenElements(contentRoot).find(
      (element) =>
        element.tagName === "SPAN" && element.textContent === "Move selection from review scope:",
    )

    expect(textFragments).toContain(
      "Review scope: 1 match + 1 context row · 2 shown of 4 searchable · Selected elements: 0",
    )
    expect(textFragments).toContain(
      "Review scope only — move and toolbar commands still act on canonical selected rows.",
    )
    expect((reviewMoveTitle as (FakeDomElement & { title?: string }) | undefined)?.title).toContain(
      "Filtered review scope: 1 matching row + 1 context row.",
    )

    const filteredRows = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    expect(filteredRows).toHaveLength(2)
  })

  it("clears row filters on Escape and returns focus to the row tree", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "text", text: "Alpha", groupIds: ["G"], isDeleted: false },
        { id: "B", type: "text", text: "Beta", groupIds: ["G"], isDeleted: false },
        { id: "C", type: "rectangle", name: "Gamma", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    let searchInput = findRowFilterInput(contentRoot)

    if (!searchInput) {
      throw new Error("Expected row filter input to exist.")
    }

    searchInput.focus()
    searchInput.value = "Alpha"
    searchInput.dispatchEvent(new FakeDomEvent("input"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    searchInput = findRowFilterInput(contentRoot)
    if (!searchInput) {
      throw new Error("Expected refreshed row filter input after filtering.")
    }

    expect(fakeDocument.activeElement).toBe(searchInput)

    searchInput.dispatchEvent(new FakeDomEvent("keydown", { key: "Escape" }))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const rowTree = findRowTreeRoot(contentRoot)
    const focusedRow = findFocusedInteractiveRow(contentRoot)
    const refreshedSearchInput = findRowFilterInput(contentRoot)

    expect(findButtonByExactText(contentRoot, "Clear filter")).toBeUndefined()
    expect(refreshedSearchInput?.value).toBe("")
    expect(rowTree).toBeDefined()
    expect(focusedRow).toBeDefined()
    expect(fakeDocument.activeElement).toBe(rowTree)
    expect(
      (rowTree as FakeDomElement & { ariaActivedescendant?: string }).ariaActivedescendant,
    ).toBe((focusedRow as FakeDomElement & { id?: string }).id)
  })

  it("routes toolbar reorder through canonical group row ids even when the group is collapsed", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [
        makeGroupNode("Outer", [makeElementNode("A"), makeElementNode("B")], false),
        makeElementNode("C"),
      ],
      selectedIds: new Set(),
      sceneVersion: 11,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    const groupRow = findInteractiveRowByLabel(contentRoot, "[group] Outer")
    if (!groupRow) {
      throw new Error("Expected collapsed group row to exist.")
    }

    groupRow.click()
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    const reorderButton = findButtonByExactText(contentRoot, "Bring to front")
    if (!reorderButton) {
      throw new Error("Expected toolbar reorder button to exist for collapsed group selection.")
    }

    reorderButton.click()
    await flushAsync()

    expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["group:Outer"], "front")
  })

  it("routes toolbar grouping through explicit group row selection", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions, commandSpies } = makeUiActions()
    const previousPrompt = globalRecord["prompt"]
    globalRecord["prompt"] = vi.fn(() => "  Nested Team  ")

    try {
      const renderer = createExcalidrawSidepanelRenderer({
        sidepanelTab: sidepanelTab.tab,
        getScriptSettings: () => ({}),
      })

      if (!renderer) {
        throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
      }

      renderer.render({
        tree: [makeGroupNode("Outer", [makeElementNode("A"), makeElementNode("B")], false)],
        selectedIds: new Set(),
        sceneVersion: 11.5,
        actions,
      })

      let contentRoot = getContentRoot(sidepanelTab.contentEl)
      const groupRow = findInteractiveRowByLabel(contentRoot, "[group] Outer")
      if (!groupRow) {
        throw new Error("Expected collapsed group row for toolbar grouping test.")
      }

      groupRow.click()
      await flushAsync()

      contentRoot = getContentRoot(sidepanelTab.contentEl)
      const groupButton = findButtonByExactText(contentRoot, "Group selected")
      if (!groupButton) {
        throw new Error("Expected toolbar group button to exist for explicit row selection.")
      }

      groupButton.click()
      await flushAsync()

      expect(actions.createGroupFromNodeIds).toHaveBeenCalledWith({
        nodeIds: ["group:Outer"],
        nameSeed: "Nested Team",
      })
      expect(commandSpies.createGroup).not.toHaveBeenCalled()
    } finally {
      globalRecord["prompt"] = previousPrompt
    }
  })

  it("routes keyboard delete group reorder and ungroup-like through explicit group row selection", async () => {
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
      tree: [makeGroupNode("Outer", [makeElementNode("A"), makeElementNode("B")], false)],
      selectedIds: new Set(),
      sceneVersion: 11.75,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    const groupRow = findInteractiveRowByLabel(contentRoot, "[group] Outer")
    if (!groupRow) {
      throw new Error("Expected collapsed group row for explicit keyboard selection test.")
    }

    groupRow.click()
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Delete")
    dispatchKeydown(contentRoot, "g")
    dispatchKeydown(contentRoot, "f")
    dispatchKeydown(contentRoot, "u")
    await flushAsync()

    expect(actions.deleteNode).toHaveBeenCalledWith("group:Outer")
    expect(actions.createGroupFromNodeIds).toHaveBeenCalledWith({
      nodeIds: ["group:Outer"],
    })
    expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["group:Outer"], "forward")
    expect(actions.reparentFromNodeIds).toHaveBeenCalledWith({
      nodeIds: ["group:Outer"],
      sourceGroupId: "Outer",
      targetParentPath: [],
      targetFrameId: null,
    })
    expect(commandSpies.deleteNode).not.toHaveBeenCalled()
    expect(commandSpies.createGroup).not.toHaveBeenCalled()
    expect(commandSpies.reorder).not.toHaveBeenCalled()
    expect(commandSpies.reparent).not.toHaveBeenCalled()
  })

  it("routes toolbar reorder through canonical filtered row ids under active filter", async () => {
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
      tree: [makeGroupNode("G", [makeElementNode("Alpha"), makeElementNode("Beta")], false)],
      selectedIds: new Set(["Alpha"]),
      sceneVersion: 12,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    const searchInput = findRowFilterInput(contentRoot)
    if (!searchInput) {
      throw new Error("Expected row filter input to exist for filtered reorder test.")
    }

    searchInput.value = "Alpha"
    searchInput.dispatchEvent(new FakeDomEvent("input"))
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    const reorderButton = findButtonByExactText(contentRoot, "Bring to front")
    if (!reorderButton) {
      throw new Error("Expected toolbar reorder button to exist after filtering rows.")
    }

    reorderButton.click()
    await flushAsync()

    expect(commandSpies.reorder).toHaveBeenCalledWith({
      orderedElementIds: ["Alpha"],
      mode: "front",
    })
    expect(actions.reorderFromNodeIds).not.toHaveBeenCalled()
  })

  it("routes drag-drop reorder through the active multi-row structural selection", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()
    let selectedElementIds: string[] = []

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
      getViewSelectedElements: () => selectedElementIds.map((id) => ({ id })),
      selectElementsInView: (ids) => {
        selectedElementIds = [...ids]
      },
      setView: vi.fn(() => ({ id: "fake-view" })),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeElementNode("B"), makeElementNode("C")],
      selectedIds: new Set(),
      sceneVersion: 12.5,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    const sourceRow = findInteractiveRowByLabel(contentRoot, "[element] A")
    if (!sourceRow) {
      throw new Error("Expected source row for keyboard-extended drag-drop selection.")
    }

    sourceRow.click()
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown", { shiftKey: true })
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    const refreshedSourceRow = findInteractiveRowByLabel(contentRoot, "[element] A")
    const targetRow = findInteractiveRowByLabel(contentRoot, "[element] C")
    if (!refreshedSourceRow || !targetRow) {
      throw new Error("Expected drag source and target rows after keyboard selection extension.")
    }

    refreshedSourceRow.dispatchEvent(new FakeDomEvent("dragstart"))
    targetRow.dispatchEvent(new FakeDomEvent("dragover"))
    targetRow.dispatchEvent(new FakeDomEvent("drop"))
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    const rowTree = findRowTreeRoot(contentRoot)
    const focusedRow = findFocusedInteractiveRow(contentRoot)

    expect(actions.reorderRelativeToNodeIds).toHaveBeenCalledWith({
      nodeIds: ["el:A", "el:B"],
      anchorNodeId: "el:C",
      placement: "after",
      notifyOnFailure: false,
    })
    expect(rowTree).toBeDefined()
    expect(focusedRow).toBeDefined()
    expect(fakeDocument.activeElement).toBe(rowTree)
    expect(
      (rowTree as FakeDomElement & { ariaActivedescendant?: string }).ariaActivedescendant,
    ).toBe((focusedRow as FakeDomElement & { id?: string }).id)
  })

  it("routes Delete shortcut through command seam for canonical element selection", async () => {
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

  it("uses canonical element selection before focused-row fallback for keyboard reorder", async () => {
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
      tree: [makeElementNode("A", "Alpha"), makeElementNode("B", "Beta")],
      selectedIds: new Set(["A"]),
      sceneVersion: 11,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    const focusedRow = findFocusedInteractiveRow(contentRoot)
    if (!focusedRow) {
      throw new Error("Expected a focused row before keyboard reorder precedence check.")
    }

    expect((focusedRow as FakeDomElement & { ariaLabel?: string }).ariaLabel).toContain("Beta")

    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(commandSpies.reorder).toHaveBeenCalledWith({
      orderedElementIds: ["A"],
      mode: "forward",
    })
    expect(actions.reorderFromNodeIds).not.toHaveBeenCalled()
  })

  it("supports keyboard-only replace-and-range selection with Space semantics", async () => {
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

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Space")
    await flushAsync()

    let lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    let selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect(selectedIds).toEqual(["A"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Space")
    await flushAsync()

    lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect(selectedIds).toEqual(["C"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowUp")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowUp")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const focusedRowBeforeRange = findFocusedInteractiveRow(contentRoot)
    if (!focusedRowBeforeRange) {
      throw new Error("Expected a focused row before Shift+Space range selection.")
    }

    dispatchKeydown(contentRoot, "Space", { shiftKey: true })
    await flushAsync()

    lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect([...(selectedIds ?? [])].sort()).toEqual(["A", "B", "C"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const focusedRowAfterRange = findFocusedInteractiveRow(contentRoot)
    if (!focusedRowAfterRange) {
      throw new Error("Expected focused row to remain available after Shift+Space selection.")
    }

    dispatchKeydown(contentRoot, "g")
    await flushAsync()

    const groupA = runtime.elements.find((element) => element.id === "A")?.groupIds ?? []
    const groupB = runtime.elements.find((element) => element.id === "B")?.groupIds ?? []
    const groupC = runtime.elements.find((element) => element.id === "C")?.groupIds ?? []

    expect(groupA.length).toBeGreaterThan(0)
    expect(groupB).toEqual(groupA)
    expect(groupC).toEqual(groupA)
  })

  it("supports keyboard-only replace-and-range selection with M alias semantics", async () => {
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

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "m")
    await flushAsync()

    let lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    let selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect(selectedIds).toEqual(["A"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "m")
    await flushAsync()

    lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect(selectedIds).toEqual(["C"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowUp")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowUp")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "m", { shiftKey: true })
    await flushAsync()

    lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect([...(selectedIds ?? [])].sort()).toEqual(["A", "B", "C"])
  })

  it("supports keyboard-only additive toggle parity with Ctrl+Space/M/N semantics", async () => {
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

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Space")
    await flushAsync()

    let lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    let selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect(selectedIds).toEqual(["A"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "m", { ctrlKey: true })
    await flushAsync()

    lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect([...(selectedIds ?? [])].sort()).toEqual(["A", "B"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "n", { ctrlKey: true })
    await flushAsync()

    lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect([...(selectedIds ?? [])].sort()).toEqual(["A", "B", "C"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "n", { ctrlKey: true })
    await flushAsync()

    lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect([...(selectedIds ?? [])].sort()).toEqual(["A", "B"])
  })

  it("keeps Space/M/N aliases on stable replace-selection debug semantics", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_INTERACTION"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
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

      let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "Space")
      await flushAsync()

      contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "ArrowDown")
      await flushAsync()

      contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "m")
      await flushAsync()

      contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "ArrowDown")
      await flushAsync()

      contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "n")
      await flushAsync()

      const gesturePayloads = logSpy.mock.calls
        .filter(([message]) => message === "[LMX:interaction] row selection gesture")
        .map(([, payload]) => (payload ?? {}) as Record<string, unknown>)

      expect(gesturePayloads).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "keyboardToggle",
            selectionOrigin: "keyboard",
            selectionSemantics: "replace",
            selectedElementIds: ["A"],
          }),
          expect.objectContaining({
            source: "keyboardToggle",
            selectionOrigin: "keyboard",
            selectionSemantics: "replace",
            selectedElementIds: ["B"],
          }),
          expect.objectContaining({
            source: "keyboardToggle",
            selectionOrigin: "keyboard",
            selectionSemantics: "replace",
            selectedElementIds: ["C"],
          }),
        ]),
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

  it("keeps Ctrl+Space/M/N aliases on stable toggle-selection debug semantics", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_INTERACTION"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    try {
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

      let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "Space")
      await flushAsync()

      contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "ArrowDown")
      await flushAsync()

      contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "m", { ctrlKey: true })
      await flushAsync()

      contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "ArrowDown")
      await flushAsync()

      contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      dispatchKeydown(contentRoot, "n", { ctrlKey: true })
      await flushAsync()

      const gesturePayloads = logSpy.mock.calls
        .filter(([message]) => message === "[LMX:interaction] row selection gesture")
        .map(([, payload]) => (payload ?? {}) as Record<string, unknown>)

      expect(gesturePayloads).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "keyboardModifierToggle",
            selectionOrigin: "keyboard",
            selectionSemantics: "toggle",
            selectedElementIds: ["A", "B"],
          }),
          expect.objectContaining({
            source: "keyboardModifierToggle",
            selectionOrigin: "keyboard",
            selectionSemantics: "toggle",
            selectedElementIds: ["A", "B", "C"],
          }),
        ]),
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

  it("preserves inline rename draft when the rename outcome is not applied", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const renameNode = vi.fn(async () => ({
      status: "preflightFailed" as const,
      reason: "scene drifted",
      attempts: 2 as const,
    }))
    const { actions } = makeUiActions({
      renameNode,
    })

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A", "Old name")],
      selectedIds: new Set(),
      sceneVersion: 14,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Enter")
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input to exist after pressing Enter.")
    }

    input.value = "Draft survives"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")
    await flushAsync()

    expect(renameNode).toHaveBeenCalledWith("el:A", "Draft survives")

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    const inputAfterFailure = findFirstInput(contentRoot)
    expect(inputAfterFailure).toBeDefined()
    expect(inputAfterFailure?.value).toBe("Draft survives")
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
    expect(fakeDocument.activeElement).toBe(findRowTreeRoot(contentRoot))

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
    expect(fakeDocument.activeElement).toBe(findRowTreeRoot(contentRoot))

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
    globalRecord["prompt"] = vi.fn().mockReturnValueOnce("")

    try {
      const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      const ungroupButton = findButtonByExactText(contentRoot, "Ungroup-like")
      if (!ungroupButton) {
        throw new Error("Expected ungroup-like toolbar button to exist.")
      }

      ungroupButton.click()
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
    await flushAsync()

    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "A", "C"])
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
    await flushAsync()

    expect(runtime.copyForEditing).not.toHaveBeenCalled()
    expect(runtime.addToView).not.toHaveBeenCalled()
    expect(runtime.updateScene).toHaveBeenCalledTimes(1)
    expect(runtime.elements.map((element) => element.id)).toEqual(["B", "A", "C", "D"])
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
          expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:B"], "forward")
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
          expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"], "forward")
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
        name: "Delete removes canonical element selection",
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
        name: "F brings canonical element selection forward by one step",
        selectedIds: ["A"],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "f")
        },
        assert: ({ commandSpies }) => {
          expect(commandSpies.reorder).toHaveBeenCalledWith({
            orderedElementIds: ["A"],
            mode: "forward",
          })
        },
      },
      {
        name: "B sends canonical element selection backward by one step",
        selectedIds: ["A"],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "b")
        },
        assert: ({ commandSpies }) => {
          expect(commandSpies.reorder).toHaveBeenCalledWith({
            orderedElementIds: ["A"],
            mode: "backward",
          })
        },
      },
      {
        name: "Shift+F brings canonical element selection to the front",
        selectedIds: ["A"],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "f", { shiftKey: true })
        },
        assert: ({ commandSpies }) => {
          expect(commandSpies.reorder).toHaveBeenCalledWith({
            orderedElementIds: ["A"],
            mode: "front",
          })
        },
      },
      {
        name: "Shift+B sends canonical element selection to the back",
        selectedIds: ["A"],
        buildTree: () => [makeElementNode("A"), makeElementNode("B")],
        dispatch: (contentRoot) => {
          dispatchKeydown(contentRoot, "b", { shiftKey: true })
        },
        assert: ({ commandSpies }) => {
          expect(commandSpies.reorder).toHaveBeenCalledWith({
            orderedElementIds: ["A"],
            mode: "back",
          })
        },
      },
      {
        name: "G groups canonical element selection",
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

  it("restores first-row vertical navigation semantics when ArrowDown runs after focus resets during tree replacement", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 59,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    fakeDocument.activeElement = fakeDocument.createElement("div")

    renderer.render({
      tree: [makeElementNode("C"), makeElementNode("D")],
      selectedIds: new Set(),
      sceneVersion: 60,
      actions,
    })

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:C"], "forward")
  })

  it("restores last-row vertical navigation semantics when ArrowUp runs after focus resets during tree replacement", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 57,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    fakeDocument.activeElement = fakeDocument.createElement("div")

    renderer.render({
      tree: [makeElementNode("C"), makeElementNode("D")],
      selectedIds: new Set(),
      sceneVersion: 58,
      actions,
    })

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowUp")
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:D"], "forward")
  })

  it("restores first-row expand semantics when ArrowRight runs after focus resets during tree replacement", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 61,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    fakeDocument.activeElement = fakeDocument.createElement("div")

    renderer.render({
      tree: [makeGroupNode("Outer", [makeElementNode("Child")], false)],
      selectedIds: new Set(),
      sceneVersion: 62,
      actions,
    })

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowRight")
    await flushAsync()

    expect(actions.toggleExpanded).toHaveBeenCalledWith("group:Outer")
  })

  it("restores first-row collapse semantics when ArrowLeft runs after focus resets during tree replacement", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 63,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    fakeDocument.activeElement = fakeDocument.createElement("div")

    renderer.render({
      tree: [makeGroupNode("Outer", [makeElementNode("Child")], true)],
      selectedIds: new Set(),
      sceneVersion: 64,
      actions,
    })

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowLeft")
    await flushAsync()

    expect(actions.toggleExpanded).toHaveBeenCalledWith("group:Outer")
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

      expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"], "forward")
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
      expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"], "forward")
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
      expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"], "forward")
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
      expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(["el:A"], "forward")
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

    const reorderButton = findButtonByExactText(contentRoot, "Bring to front")
    if (!reorderButton) {
      throw new Error("Expected toolbar reorder button to exist.")
    }

    reorderButton.click()
    await flushAsync()

    expect(commandSpies.reorder).toHaveBeenCalledWith({
      orderedElementIds: ["A"],
      mode: "front",
    })
    expect(actions.reorderFromNodeIds).not.toHaveBeenCalled()

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

  it("keeps canonical-element planner errors fail-closed with zero writes", async () => {
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
