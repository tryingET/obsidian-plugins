import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"

import {
  FakeDocument,
  FakeDomElement,
  FakeDomEvent,
  dispatchClick,
  dispatchKeydown,
  findInteractiveRowByLabel,
  flattenElements,
  flushAsync,
  getContentRoot,
  getInteractiveRows,
  getSelectedRows,
  makeSidepanelTab,
} from "./sidepanelTestHarness.js"
import type { SidepanelTabHarness } from "./sidepanelTestHarness.js"

const cloneElement = (element: RawExcalidrawElement): RawExcalidrawElement => ({
  ...element,
  groupIds: [...(element.groupIds ?? [])],
  customData: { ...(element.customData ?? {}) },
})

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
  readonly requireSetViewForReadCalls?: boolean
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
  let targetViewGeneration = 0
  const bindTargetView = (loaded: boolean): { id: string; _loaded: boolean } => {
    targetViewGeneration += 1
    return {
      id: `fake-view-${targetViewGeneration}`,
      _loaded: loaded,
    }
  }

  const ea: EaLike = {
    targetView: bindTargetView(true),
    setView: () => {
      throw new Error("setView not initialized")
    },
    getViewElements: () => elements,
    getViewSelectedElements: () => {
      if (options.requireSetViewForReadCalls === true && !viewBound) {
        throw new Error("targetView not set")
      }

      return elements.filter((element) => selectedIdSet.has(element.id))
    },
    selectElementsInView: () => {
      throw new Error("selectElementsInView not initialized")
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

  const setView = vi.fn(() => {
    viewBound = true
    const nextTargetView = bindTargetView(true)
    ea.targetView = nextTargetView

    return nextTargetView
  })

  const clearViewBinding = (): void => {
    viewBound = false
    ea.targetView = bindTargetView(false)
  }

  const selectInView = vi.fn((ids: readonly string[]) => {
    if (options.requireSetViewForSelectCalls === true && !viewBound) {
      throw new Error("targetView not set")
    }

    setSelectedIds(ids)
  })

  ea.setView = setView
  ea.selectElementsInView = selectInView

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

  it("uses onChange selectedElementIds payload for canvas-to-sidepanel selection sync", async () => {
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

  it("interaction debug captures stale targetView churn before mouse and keyboard row-selection writes", async () => {
    const debugFlagKey = "LMX_DEBUG_SIDEPANEL_INTERACTION"
    const hadDebugFlag = Object.prototype.hasOwnProperty.call(globalRecord, debugFlagKey)
    const previousDebugFlag = globalRecord[debugFlagKey]
    globalRecord[debugFlagKey] = true

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const readInteractionPayloads = (message: string): Record<string, unknown>[] => {
      return logSpy.mock.calls
        .filter(([entry]) => entry === `[LMX:interaction] ${message}`)
        .map(([, payload]) => (payload ?? {}) as Record<string, unknown>)
    }

    try {
      const mouseRuntime = makeRuntimeWithSidepanel(
        fakeDocument,
        [
          { id: "A", type: "rectangle", name: "A", isDeleted: false },
          { id: "B", type: "rectangle", name: "B", isDeleted: false },
        ],
        [],
        {
          requireSetViewForSelectCalls: true,
          requireSetViewForReadCalls: true,
        },
      )

      createLayerManagerRuntime(mouseRuntime.ea)
      mouseRuntime.setView.mockClear()
      mouseRuntime.clearViewBinding()

      let mouseContentRoot = getContentRoot(mouseRuntime.sidepanelTab.contentEl)
      const mouseRow = findInteractiveRowByLabel(mouseContentRoot, "[element] A")
      if (!mouseRow) {
        throw new Error("Expected mouse row under stale targetView churn test.")
      }

      dispatchClick(mouseRow)
      await flushAsync()

      mouseContentRoot = getContentRoot(mouseRuntime.sidepanelTab.contentEl)
      expect(getSelectedRows(mouseContentRoot)).toHaveLength(1)
      expect(mouseRuntime.setView).toHaveBeenCalled()

      const keyboardRuntime = makeRuntimeWithSidepanel(
        fakeDocument,
        [
          { id: "A", type: "rectangle", name: "A", isDeleted: false },
          { id: "B", type: "rectangle", name: "B", isDeleted: false },
        ],
        [],
        {
          requireSetViewForSelectCalls: true,
          requireSetViewForReadCalls: true,
        },
      )

      createLayerManagerRuntime(keyboardRuntime.ea)
      keyboardRuntime.setView.mockClear()
      keyboardRuntime.clearViewBinding()

      const keyboardContentRoot = getContentRoot(keyboardRuntime.sidepanelTab.contentEl)
      dispatchKeydown(keyboardContentRoot, "Space")
      await flushAsync()

      expect(getSelectedRows(getContentRoot(keyboardRuntime.sidepanelTab.contentEl))).toHaveLength(
        1,
      )
      expect(keyboardRuntime.setView).toHaveBeenCalled()

      expect(readInteractionPayloads("row selection gesture")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "mouseClick",
            hasTargetView: true,
            targetViewLoaded: false,
            targetViewUsable: false,
            hasSetView: true,
          }),
          expect.objectContaining({
            source: "keyboardToggle",
            hasTargetView: true,
            targetViewLoaded: true,
            targetViewUsable: true,
            hasSetView: true,
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

  it("adds a second explicit row selection on modifier-click without replacing the anchor selection", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", name: "A", isDeleted: false },
        { id: "B", type: "rectangle", name: "B", isDeleted: false },
        { id: "C", type: "rectangle", name: "C", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const firstRow = findInteractiveRowByLabel(contentRoot, "[element] A")

    if (!firstRow) {
      throw new Error("Expected row for element A in modifier-click selection test.")
    }

    firstRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const targetRow = findInteractiveRowByLabel(contentRoot, "[element] C")
    if (!targetRow) {
      throw new Error("Expected row for element C after initial row-click selection.")
    }

    dispatchClick(targetRow, { metaKey: true })
    await flushAsync()

    const lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    const selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect([...(selectedIds ?? [])].sort()).toEqual(["A", "C"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(2)
  })

  it("extends the explicit row selection across the visible range on shift-click", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", name: "A", isDeleted: false },
        { id: "B", type: "rectangle", name: "B", isDeleted: false },
        { id: "C", type: "rectangle", name: "C", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const anchorRow = findInteractiveRowByLabel(contentRoot, "[element] A")

    if (!anchorRow) {
      throw new Error("Expected row for element A in shift-click selection test.")
    }

    anchorRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const targetRow = findInteractiveRowByLabel(contentRoot, "[element] C")
    if (!targetRow) {
      throw new Error("Expected row for element C after establishing the selection anchor.")
    }

    dispatchClick(targetRow, { shiftKey: true })
    await flushAsync()

    const lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    const selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect([...(selectedIds ?? [])].sort()).toEqual(["A", "B", "C"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(3)
  })

  it("keeps explicit mouse multi-selection coherent through host echo and drag-drop reorder", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      [
        { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
        { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
        { id: "C", type: "rectangle", name: "Gamma", isDeleted: false },
      ],
      [],
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const firstRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")

    if (!firstRow) {
      throw new Error("Expected row for element Alpha in mouse multi-selection drag-drop test.")
    }

    firstRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const secondRow = findInteractiveRowByLabel(contentRoot, "[element] Beta")
    if (!secondRow) {
      throw new Error("Expected row for element Beta after establishing the initial selection.")
    }

    dispatchClick(secondRow, { metaKey: true })
    await flushAsync()

    expect(runtime.selectInView).toHaveBeenCalledTimes(2)
    const lastSelectCallIndex = runtime.selectInView.mock.calls.length - 1
    const selectedIds = runtime.selectInView.mock.calls[lastSelectCallIndex]?.[0] as
      | readonly string[]
      | undefined

    expect([...(selectedIds ?? [])].sort()).toEqual(["A", "B"])

    runtime.emitSceneChange({
      selectedElementIds: {
        A: true,
        B: true,
      },
    })
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(2)

    const dragSourceRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")
    const dropTargetRow = findInteractiveRowByLabel(contentRoot, "[element] Gamma")
    if (!dragSourceRow || !dropTargetRow) {
      throw new Error("Expected drag source and drop target rows after host selection echo.")
    }

    dragSourceRow.dispatchEvent(new FakeDomEvent("dragstart"))
    dropTargetRow.dispatchEvent(new FakeDomEvent("dragover"))
    dropTargetRow.dispatchEvent(new FakeDomEvent("drop"))
    await flushAsync()
    await flushAsync()

    expect(runtime.elements.map((element) => element.id)).toEqual(["C", "A", "B"])

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(2)
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
