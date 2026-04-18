import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"
import { clearHostContextFlightRecorder } from "../src/ui/sidepanel/selection/hostContextFlightRecorder.js"

import {
  FakeDocument,
  type FakeDomElement,
  FakeDomEvent,
  dispatchKeydown,
  findFocusedInteractiveRow,
  findInteractiveRowByLabel,
  findRowFilterInput,
  findRowTreeRoot,
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

const expectInactiveSidepanelState = (contentRoot: FakeDomElement, detail: string): void => {
  expect(getInteractiveRows(contentRoot)).toHaveLength(0)
  expect(getSelectedRows(contentRoot)).toHaveLength(0)
  expect(findRowTreeRoot(contentRoot)).toBeUndefined()
  expect(findRowFilterInput(contentRoot)).toBeUndefined()

  const textFragments = flattenElements(contentRoot).map((element) => element.textContent ?? "")
  expect(textFragments).toEqual(
    expect.arrayContaining([
      "Layer Manager inactive",
      detail,
      "Focus an Excalidraw view to resume live Layer Manager interaction.",
    ]),
  )
}

const expectUnboundSidepanelState = (contentRoot: FakeDomElement): void => {
  expect(getInteractiveRows(contentRoot)).toHaveLength(0)
  expect(getSelectedRows(contentRoot)).toHaveLength(0)
  expect(findRowTreeRoot(contentRoot)).toBeUndefined()
  expect(findRowFilterInput(contentRoot)).toBeUndefined()

  const textFragments = flattenElements(contentRoot).map((element) => element.textContent ?? "")
  expect(textFragments).toEqual(
    expect.arrayContaining([
      "Layer Manager unbound",
      "No active Excalidraw view is currently bound.",
      "Focus an Excalidraw view to resume live Layer Manager interaction.",
    ]),
  )
}

interface RuntimeWithSidepanel {
  readonly ea: EaLike
  readonly sidepanelTab: SidepanelTabHarness
  readonly getExcalidrawAPI: ReturnType<typeof vi.fn>
  readonly getViewElements: ReturnType<typeof vi.fn>
  readonly detachLeaf: ReturnType<typeof vi.fn>
  readonly switchToView: (viewPath: string) => void
  readonly switchWorkspaceToView: (viewPath: string) => void
  readonly emitWorkspaceEvent: (eventName?: string) => void
  readonly emitSceneChange: (appState?: unknown) => void
}

type DrawingFixture =
  | readonly RawExcalidrawElement[]
  | {
      readonly elements: readonly RawExcalidrawElement[]
      readonly frontmatter?: Record<string, unknown>
      readonly filePath?: string
      readonly workspaceFilePath?: string | null
      readonly viewId?: string
      readonly leafId?: string
      readonly viewType?: string
      readonly bindTargetView?: boolean
    }

const isArrayDrawingFixture = (
  fixture: DrawingFixture,
): fixture is readonly RawExcalidrawElement[] => {
  return Array.isArray(fixture)
}

const normalizeDrawingFixture = (
  viewPath: string,
  fixture: DrawingFixture,
): {
  readonly elements: readonly RawExcalidrawElement[]
  readonly frontmatter: Record<string, unknown>
  readonly filePath: string
  readonly workspaceFilePath: string | null
  readonly viewId: string
  readonly leafId: string
  readonly viewType: string
  readonly bindTargetView: boolean
} => {
  if (isArrayDrawingFixture(fixture)) {
    return {
      elements: fixture,
      frontmatter: {
        "excalidraw-plugin": "parsed",
      },
      filePath: viewPath,
      workspaceFilePath: viewPath,
      viewId: viewPath,
      leafId: viewPath,
      viewType: "excalidraw",
      bindTargetView: true,
    }
  }

  return {
    elements: fixture.elements,
    frontmatter: fixture.frontmatter ?? {},
    filePath: fixture.filePath ?? viewPath,
    workspaceFilePath: fixture.workspaceFilePath ?? fixture.filePath ?? viewPath,
    viewId: fixture.viewId ?? viewPath,
    leafId: fixture.leafId ?? fixture.viewId ?? viewPath,
    viewType: fixture.viewType ?? "excalidraw",
    bindTargetView: fixture.bindTargetView ?? true,
  }
}

type TargetViewAppWorkspaceMode = "shared" | "no-events" | "none"

interface MakeRuntimeWithSidepanelOptions {
  readonly disableWorkspaceEvents?: boolean
  readonly omitEaApp?: boolean
  readonly omitMetadataCache?: boolean
  readonly requireSetViewForReadCalls?: boolean
  readonly requireSetViewForApiCalls?: boolean
  readonly targetViewAppWorkspaceMode?: TargetViewAppWorkspaceMode
}

const makeRuntimeWithSidepanel = (
  document: FakeDocument,
  input: Record<string, DrawingFixture>,
  initialViewPath: string,
  options: MakeRuntimeWithSidepanelOptions = {},
): RuntimeWithSidepanel => {
  const normalizedByPath = new Map(
    Object.entries(input).map(([viewPath, fixture]) => [
      viewPath,
      normalizeDrawingFixture(viewPath, fixture),
    ]),
  )
  const fixtureByFilePath = new Map<string, ReturnType<typeof normalizeDrawingFixture>>()
  for (const fixture of normalizedByPath.values()) {
    if (!fixtureByFilePath.has(fixture.filePath)) {
      fixtureByFilePath.set(fixture.filePath, fixture)
    }
  }

  const drawingByPath = new Map(
    [...normalizedByPath.entries()].map(([viewPath, fixture]) => [
      viewPath,
      {
        elements: fixture.elements.map(cloneElement),
        selectedIds: new Set<string>(),
      },
    ]),
  )

  let activeViewPath = initialViewPath
  const workspaceListeners = new Map<string, Set<(...args: unknown[]) => unknown>>()
  const sidepanelTab = makeSidepanelTab(document, null)
  const sceneChangeListeners = new Set<
    (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
  >()
  const viewPathById = new Map(
    [...normalizedByPath.entries()].map(([viewPath, fixture]) => [fixture.viewId, viewPath]),
  )

  const metadataCache = {
    getFileCache: (file: unknown) => {
      const path =
        file && typeof file === "object" && typeof (file as { path?: unknown }).path === "string"
          ? ((file as { path: string }).path as string)
          : null

      if (!path) {
        return null
      }

      const fixture = fixtureByFilePath.get(path)
      if (!fixture) {
        return null
      }

      return {
        frontmatter: fixture.frontmatter,
      }
    },
  }

  const createWorkspace = (includeEventApis: boolean) => ({
    ...(includeEventApis
      ? {
          on: (eventName: string, callback: (...args: unknown[]) => unknown) => {
            let listeners = workspaceListeners.get(eventName)
            if (!listeners) {
              listeners = new Set()
              workspaceListeners.set(eventName, listeners)
            }

            listeners.add(callback)
            return {
              eventName,
              callback,
            }
          },
          offref: (ref: unknown) => {
            if (!ref || typeof ref !== "object") {
              return
            }

            const eventName = (ref as { eventName?: unknown }).eventName
            const callback = (ref as { callback?: unknown }).callback
            if (typeof eventName !== "string" || typeof callback !== "function") {
              return
            }

            workspaceListeners.get(eventName)?.delete(callback as (...args: unknown[]) => unknown)
          },
        }
      : {}),
    getActiveFile: () => {
      const workspaceFilePath = normalizedByPath.get(activeViewPath)?.workspaceFilePath
      return workspaceFilePath === null
        ? null
        : {
            path: workspaceFilePath ?? activeViewPath,
          }
    },
    get activeLeaf() {
      const fixture = normalizedByPath.get(activeViewPath)
      return {
        id: fixture?.leafId ?? activeViewPath,
        view: {
          file: fixture
            ? {
                path: fixture.filePath,
              }
            : null,
          getViewType: () => fixture?.viewType ?? "unknown",
        },
      }
    },
  })

  const app = {
    ...(options.omitMetadataCache === true ? {} : { metadataCache }),
    workspace: createWorkspace(options.disableWorkspaceEvents !== true),
  }

  const targetViewAppWorkspaceMode = options.targetViewAppWorkspaceMode ?? "shared"
  const targetViewApp =
    targetViewAppWorkspaceMode === "shared"
      ? app
      : {
          ...(options.omitMetadataCache === true ? {} : { metadataCache }),
          ...(targetViewAppWorkspaceMode === "none" ? {} : { workspace: createWorkspace(false) }),
        }

  const buildTargetViewForPath = (viewPath: string): Record<string, unknown> | null => {
    const fixture = normalizedByPath.get(viewPath)
    if (!fixture || fixture.bindTargetView === false) {
      return null
    }

    return {
      id: fixture.viewId,
      _loaded: true,
      file: {
        path: fixture.filePath,
      },
      leaf: {
        id: fixture.leafId,
      },
      app: targetViewApp,
    }
  }

  const viewByPath = new Map(
    [...normalizedByPath.keys()].map((viewPath) => [viewPath, buildTargetViewForPath(viewPath)]),
  )

  const getBoundViewPath = (): string => {
    const targetView = ea.targetView
    if (targetView && typeof targetView === "object") {
      const targetViewRecord = targetView as Record<string, unknown>
      const viewId = typeof targetViewRecord["id"] === "string" ? targetViewRecord["id"] : null
      if (viewId) {
        const resolvedViewPath = viewPathById.get(viewId)
        if (resolvedViewPath) {
          return resolvedViewPath
        }
      }

      const targetViewFile = targetViewRecord["file"] as { path?: unknown } | undefined
      const path = typeof targetViewFile?.path === "string" ? targetViewFile.path : null

      if (path) {
        const matchingViewPaths = [...normalizedByPath.entries()]
          .filter(([, fixture]) => fixture.filePath === path)
          .map(([viewPath]) => viewPath)

        if (matchingViewPaths.length === 1) {
          return matchingViewPaths[0] ?? activeViewPath
        }
      }
    }

    return activeViewPath
  }

  const hasFreshViewBinding = (): boolean => {
    return getBoundViewPath() === activeViewPath
  }

  const getCurrentDrawing = () => {
    const boundViewPath = getBoundViewPath()
    const drawing = drawingByPath.get(boundViewPath)
    if (!drawing) {
      throw new Error(`Missing drawing state for ${boundViewPath}.`)
    }

    return drawing
  }

  const setSelectedIds = (ids: readonly string[]): void => {
    const drawing = getCurrentDrawing()
    drawing.selectedIds.clear()
    for (const id of ids) {
      drawing.selectedIds.add(id)
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
    const snapshot = getCurrentDrawing().elements.map(cloneElement)
    for (const listener of [...sceneChangeListeners]) {
      listener(snapshot, appState, {})
    }
  }

  const updateScene = vi.fn((scene: { elements?: RawExcalidrawElement[]; appState?: unknown }) => {
    const drawing = getCurrentDrawing()

    if (Array.isArray(scene.elements)) {
      drawing.elements.splice(0, drawing.elements.length, ...scene.elements.map(cloneElement))
    }

    const selectedIdsFromAppState = readSelectedIdsFromAppState(scene.appState)
    if (selectedIdsFromAppState) {
      setSelectedIds(selectedIdsFromAppState)
    }

    emitSceneChange(scene.appState ?? {})
  })

  const getExcalidrawAPI = vi.fn(function (this: EaLike) {
    if (options.requireSetViewForApiCalls === true && !hasFreshViewBinding()) {
      throw new Error("targetView not set")
    }

    return {
      updateScene,
      onChange: (
        callback: (
          elements: readonly RawExcalidrawElement[],
          appState: unknown,
          files: unknown,
        ) => void,
      ) => {
        sceneChangeListeners.add(callback)
        return () => {
          sceneChangeListeners.delete(callback)
        }
      },
    }
  })

  const detachLeaf = vi.fn()

  const getViewElements = vi.fn(() => {
    if (options.requireSetViewForReadCalls === true && !hasFreshViewBinding()) {
      throw new Error("targetView not set")
    }

    return getCurrentDrawing().elements
  })

  const ea: EaLike = {
    ...(options.omitEaApp ? {} : { app }),
    targetView: viewByPath.get(activeViewPath) ?? null,
    setView: vi.fn((viewArg?: unknown) => {
      if (viewArg === "active" || viewArg === undefined) {
        ea.targetView = viewByPath.get(activeViewPath) ?? null
      }

      return ea.targetView
    }),
    getViewElements,
    getViewSelectedElements: () => {
      if (options.requireSetViewForReadCalls === true && !hasFreshViewBinding()) {
        throw new Error("targetView not set")
      }

      const drawing = getCurrentDrawing()
      return drawing.elements.filter((element) => drawing.selectedIds.has(element.id))
    },
    selectElementsInView: vi.fn((ids: readonly string[]) => {
      setSelectedIds(ids)
    }),
    getScriptSettings: () => ({}),
    getExcalidrawAPI,
    sidepanelTab: null,
    createSidepanelTab: () => sidepanelTab.tab,
    getSidepanelLeaf: () => ({
      detach: detachLeaf,
    }),
  }

  sidepanelTab.tab.getHostEA = () => ea

  return {
    ea,
    sidepanelTab,
    getExcalidrawAPI,
    getViewElements,
    detachLeaf,
    switchToView: (viewPath: string) => {
      if (!drawingByPath.has(viewPath)) {
        throw new Error(`Cannot switch to unknown drawing ${viewPath}.`)
      }

      activeViewPath = viewPath
      ea.targetView = viewByPath.get(viewPath) ?? null
    },
    switchWorkspaceToView: (viewPath: string) => {
      if (!drawingByPath.has(viewPath)) {
        throw new Error(`Cannot switch to unknown drawing ${viewPath}.`)
      }

      activeViewPath = viewPath
    },
    emitWorkspaceEvent: (eventName = "file-open") => {
      for (const listener of [...(workspaceListeners.get(eventName) ?? [])]) {
        listener()
      }
    },
    emitSceneChange,
  }
}

describe("runtime active-view refresh", () => {
  const globalRecord = globalThis as Record<string, unknown>

  let hadDocumentProperty = false
  let previousDocumentValue: unknown
  let fakeDocument: FakeDocument

  beforeEach(() => {
    hadDocumentProperty = Object.prototype.hasOwnProperty.call(globalRecord, "document")
    previousDocumentValue = globalRecord["document"]

    fakeDocument = new FakeDocument()
    globalRecord["document"] = fakeDocument as unknown as Document
    clearHostContextFlightRecorder()
  })

  afterEach(() => {
    clearHostContextFlightRecorder()

    if (hadDocumentProperty) {
      globalRecord["document"] = previousDocumentValue
      return
    }

    Reflect.deleteProperty(globalRecord, "document")
  })

  it("resets row filter, selection, and focus when the active drawing changes", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [
          { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
          { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
        ],
        "B.excalidraw": [
          { id: "C", type: "rectangle", name: "Gamma", isDeleted: false },
          { id: "D", type: "rectangle", name: "Delta", isDeleted: false },
        ],
      },
      "A.excalidraw",
    )

    const app = createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const searchInput = findRowFilterInput(contentRoot)
    if (!searchInput) {
      throw new Error("Expected row filter input in the initial drawing.")
    }

    searchInput.focus()
    searchInput.value = "Alpha"
    searchInput.dispatchEvent(new FakeDomEvent("input"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const alphaRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")
    if (!alphaRow) {
      throw new Error("Expected Alpha row while the first drawing filter is active.")
    }

    expect(findInteractiveRowByLabel(contentRoot, "[element] Beta")).toBeUndefined()

    alphaRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(1)

    runtime.switchToView("B.excalidraw")
    app.refresh()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const refreshedSearchInput = findRowFilterInput(contentRoot)
    expect(refreshedSearchInput?.value).toBe("")
    expect(findInteractiveRowByLabel(contentRoot, "[element] Gamma")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Delta")).toBeDefined()
    expect(getSelectedRows(contentRoot)).toHaveLength(0)

    const focusedRow = findFocusedInteractiveRow(contentRoot)
    const focusedRowLabel = (focusedRow as (FakeDomElement & { ariaLabel?: string }) | undefined)
      ?.ariaLabel

    expect(focusedRowLabel).toBeDefined()
    expect([focusedRowLabel]).toEqual(
      expect.arrayContaining([expect.stringMatching(/Gamma|Delta/)]),
    )
    expect(focusedRowLabel).not.toContain("Alpha")
  })

  it("auto-refreshes cross-file Excalidraw switches from workspace leaf-change events", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [
          { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
          { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
        ],
        "B.excalidraw": [
          { id: "C", type: "rectangle", name: "Gamma", isDeleted: false },
          { id: "D", type: "rectangle", name: "Delta", isDeleted: false },
        ],
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)
    const setView = runtime.ea.setView as ReturnType<typeof vi.fn>
    setView.mockClear()

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const searchInput = findRowFilterInput(contentRoot)
    if (!searchInput) {
      throw new Error("Expected row filter input in the initial drawing.")
    }

    searchInput.focus()
    searchInput.value = "Alpha"
    searchInput.dispatchEvent(new FakeDomEvent("input"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const alphaRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")
    if (!alphaRow) {
      throw new Error("Expected Alpha row while the first drawing filter is active.")
    }

    alphaRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(1)

    runtime.switchWorkspaceToView("B.excalidraw")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    expect(setView).toHaveBeenCalledTimes(1)

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const refreshedSearchInput = findRowFilterInput(contentRoot)
    expect(refreshedSearchInput?.value).toBe("")
    expect(findInteractiveRowByLabel(contentRoot, "[element] Gamma")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Delta")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeUndefined()
    expect(getSelectedRows(contentRoot)).toHaveLength(0)

    const focusedRow = findFocusedInteractiveRow(contentRoot)
    const focusedRowLabel = (focusedRow as (FakeDomElement & { ariaLabel?: string }) | undefined)
      ?.ariaLabel

    expect(focusedRowLabel).toBeDefined()
    expect([focusedRowLabel]).toEqual(
      expect.arrayContaining([expect.stringMatching(/Gamma|Delta/)]),
    )
    expect(focusedRowLabel).not.toContain("Alpha")
  })

  it("keeps row-tree focus when a workspace-driven Excalidraw switch starts inside the sidepanel", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [
          { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
          { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
        ],
        "B.excalidraw": [
          { id: "C", type: "rectangle", name: "Gamma", isDeleted: false },
          { id: "D", type: "rectangle", name: "Delta", isDeleted: false },
        ],
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const searchInput = findRowFilterInput(contentRoot)
    if (!searchInput) {
      throw new Error("Expected row filter input in the initial drawing.")
    }

    searchInput.focus()
    searchInput.value = "Alpha"
    searchInput.dispatchEvent(new FakeDomEvent("input"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const alphaRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")
    if (!alphaRow) {
      throw new Error("Expected Alpha row while the first drawing filter is active.")
    }

    alphaRow.click()
    await flushAsync()

    runtime.switchWorkspaceToView("B.excalidraw")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const rowTreeRoot = findRowTreeRoot(contentRoot)
    const focusedRow = findFocusedInteractiveRow(contentRoot)
    const focusedRowLabel = (focusedRow as (FakeDomElement & { ariaLabel?: string }) | undefined)
      ?.ariaLabel

    expect(rowTreeRoot).toBeDefined()
    expect(fakeDocument.activeElement).toBe(rowTreeRoot)
    expect([focusedRowLabel]).toEqual(
      expect.arrayContaining([expect.stringMatching(/Gamma|Delta/)]),
    )
    expect(focusedRowLabel).not.toContain("Alpha")
  })

  it("does not steal focus from the host drawing when a workspace-driven Excalidraw switch starts outside the sidepanel", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [
          { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
          { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
        ],
        "B.excalidraw": [
          { id: "C", type: "rectangle", name: "Gamma", isDeleted: false },
          { id: "D", type: "rectangle", name: "Delta", isDeleted: false },
        ],
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)

    const outsideTarget = fakeDocument.createElement("button")
    fakeDocument.activeElement = outsideTarget

    runtime.switchWorkspaceToView("B.excalidraw")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findInteractiveRowByLabel(contentRoot, "[element] Gamma")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Delta")).toBeDefined()
    expect(findFocusedInteractiveRow(contentRoot)).toBeUndefined()
    expect(fakeDocument.activeElement).toBe(outsideTarget)
  })

  it("treats active-leaf fallback binding changes as refresh-worthy even while the host stays unbound", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": {
          elements: [],
          bindTargetView: false,
          frontmatter: {
            "excalidraw-plugin": "parsed",
          },
        },
        "B.excalidraw": {
          elements: [],
          bindTargetView: false,
          frontmatter: {
            "excalidraw-plugin": "parsed",
          },
        },
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)

    const traceRead = globalRecord["LMX_HOST_CONTEXT_TRACE_READ"] as
      | (() => readonly {
          readonly category: string
          readonly message: string
          readonly payload: Record<string, unknown> | null
        }[])
      | undefined
    const traceClear = globalRecord["LMX_HOST_CONTEXT_TRACE_CLEAR"] as (() => void) | undefined

    expectUnboundSidepanelState(getContentRoot(runtime.sidepanelTab.contentEl))

    traceClear?.()

    runtime.switchWorkspaceToView("B.excalidraw")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    expectUnboundSidepanelState(getContentRoot(runtime.sidepanelTab.contentEl))

    const signalEvent = traceRead?.().find(
      (event) => event.category === "signal" && event.message === "host-context signal reconciled",
    )

    expect(signalEvent?.payload).toEqual(
      expect.objectContaining({
        source: "workspace:active-leaf-change",
        scheduledRefresh: true,
        previousState: "unbound",
        nextState: "unbound",
        sceneRefSource: "active-leaf",
      }),
    )
    expect(`${signalEvent?.payload?.["previousBindingKey"] ?? ""}`).toContain("A.excalidraw")
    expect(`${signalEvent?.payload?.["nextBindingKey"] ?? ""}`).toContain("B.excalidraw")
  })

  it("derives active-leaf file truth from leaf.view.file when workspace.getActiveFile() returns null", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": {
          elements: [],
          bindTargetView: false,
          workspaceFilePath: null,
          frontmatter: {
            "excalidraw-plugin": "parsed",
          },
        },
        "B.excalidraw": {
          elements: [],
          bindTargetView: false,
          workspaceFilePath: null,
          frontmatter: {
            "excalidraw-plugin": "parsed",
          },
        },
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)

    const traceRead = globalRecord["LMX_HOST_CONTEXT_TRACE_READ"] as
      | (() => readonly {
          readonly category: string
          readonly message: string
          readonly payload: Record<string, unknown> | null
        }[])
      | undefined
    const traceClear = globalRecord["LMX_HOST_CONTEXT_TRACE_CLEAR"] as (() => void) | undefined

    expectUnboundSidepanelState(getContentRoot(runtime.sidepanelTab.contentEl))

    traceClear?.()

    runtime.switchWorkspaceToView("B.excalidraw")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    expectUnboundSidepanelState(getContentRoot(runtime.sidepanelTab.contentEl))

    const signalEvent = traceRead?.().find(
      (event) => event.category === "signal" && event.message === "host-context signal reconciled",
    )

    expect(signalEvent?.payload).toEqual(
      expect.objectContaining({
        source: "workspace:active-leaf-change",
        scheduledRefresh: true,
        previousState: "unbound",
        nextState: "unbound",
        sceneRefSource: "active-leaf",
      }),
    )
    expect(`${signalEvent?.payload?.["previousBindingKey"] ?? ""}`).toContain("A.excalidraw")
    expect(`${signalEvent?.payload?.["nextBindingKey"] ?? ""}`).toContain("B.excalidraw")
  })

  it("does not reset row focus when the sidepanel leaf becomes active but the bound Excalidraw targetView stays the same", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [
          { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
          { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
        ],
        sidepanel: {
          filePath: "A.excalidraw",
          viewId: "sidepanel:view",
          leafId: "sidepanel:leaf",
          viewType: "sidepanel",
          frontmatter: {
            "excalidraw-plugin": "parsed",
          },
          elements: [],
          bindTargetView: false,
        },
      },
      "A.excalidraw",
    )

    createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const alphaRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")
    if (!alphaRow) {
      throw new Error("Expected Alpha row before sidepanel leaf focus transition.")
    }

    alphaRow.click()
    await flushAsync()

    runtime.switchWorkspaceToView("sidepanel")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const focusedRowBeforeArrow = findFocusedInteractiveRow(contentRoot)
    const focusedRowBeforeArrowLabel = (
      focusedRowBeforeArrow as (FakeDomElement & { ariaLabel?: string }) | undefined
    )?.ariaLabel

    expect(focusedRowBeforeArrowLabel).toContain("Alpha")

    const rowsBeforeArrow = getInteractiveRows(contentRoot)
    const focusedIndexBeforeArrow = rowsBeforeArrow.findIndex(
      (row) =>
        ((row as FakeDomElement & { ariaLabel?: string }).ariaLabel ?? "") ===
        focusedRowBeforeArrowLabel,
    )
    expect(focusedIndexBeforeArrow).toBeGreaterThanOrEqual(0)

    const moveKey = focusedIndexBeforeArrow >= rowsBeforeArrow.length - 1 ? "ArrowUp" : "ArrowDown"

    dispatchKeydown(contentRoot, moveKey)
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const focusedRowAfterArrow = findFocusedInteractiveRow(contentRoot)
    const focusedRowAfterArrowLabel = (
      focusedRowAfterArrow as (FakeDomElement & { ariaLabel?: string }) | undefined
    )?.ariaLabel

    const rowsAfterArrow = getInteractiveRows(contentRoot)
    const focusedIndexAfterArrow = rowsAfterArrow.findIndex(
      (row) =>
        ((row as FakeDomElement & { ariaLabel?: string }).ariaLabel ?? "") ===
        focusedRowAfterArrowLabel,
    )

    expect(focusedRowAfterArrowLabel).toBeDefined()
    expect(focusedIndexAfterArrow).toBeGreaterThanOrEqual(0)
    expect(focusedIndexAfterArrow).not.toBe(focusedIndexBeforeArrow)
  })

  it("does not refresh runtime snapshot when the sidepanel leaf becomes active without changing binding or rebind pressure", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [
          { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
          { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
        ],
        sidepanel: {
          filePath: "A.excalidraw",
          workspaceFilePath: null,
          viewId: "sidepanel:view",
          leafId: "sidepanel:leaf",
          viewType: "sidepanel",
          frontmatter: {
            "excalidraw-plugin": "parsed",
          },
          elements: [],
          bindTargetView: false,
        },
      },
      "A.excalidraw",
    )

    createLayerManagerRuntime(runtime.ea)
    runtime.getViewElements.mockClear()

    runtime.switchWorkspaceToView("sidepanel")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    expect(runtime.getViewElements).not.toHaveBeenCalled()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Beta")).toBeDefined()
  })

  it("treats same-file targetView identity switches in both directions as active-view changes even when file path and leaf stay stable", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        front: {
          filePath: "Card.excalidraw",
          viewId: "Card.excalidraw#front",
          leafId: "card-leaf",
          frontmatter: {
            "excalidraw-plugin": "parsed",
          },
          elements: [
            { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
            { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
          ],
        },
        back: {
          filePath: "Card.excalidraw",
          viewId: "Card.excalidraw#back",
          leafId: "card-leaf",
          frontmatter: {
            "excalidraw-plugin": "parsed",
          },
          elements: [
            { id: "C", type: "rectangle", name: "Gamma", isDeleted: false },
            { id: "D", type: "rectangle", name: "Delta", isDeleted: false },
          ],
        },
      },
      "front",
    )

    const app = createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const searchInput = findRowFilterInput(contentRoot)
    if (!searchInput) {
      throw new Error("Expected row filter input in the initial card face.")
    }

    searchInput.focus()
    searchInput.value = "Alpha"
    searchInput.dispatchEvent(new FakeDomEvent("input"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const alphaRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")
    if (!alphaRow) {
      throw new Error("Expected Alpha row while the front card face filter is active.")
    }

    alphaRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(1)

    runtime.switchToView("back")
    app.refresh()
    await flushAsync(12)

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const refreshedSearchInput = findRowFilterInput(contentRoot)
    expect(refreshedSearchInput?.value).toBe("")
    expect(findInteractiveRowByLabel(contentRoot, "[element] Gamma")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Delta")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeUndefined()
    expect(getSelectedRows(contentRoot)).toHaveLength(0)

    const focusedBackRow = findFocusedInteractiveRow(contentRoot)
    const focusedBackRowLabel = (
      focusedBackRow as (FakeDomElement & { ariaLabel?: string }) | undefined
    )?.ariaLabel

    expect(focusedBackRowLabel).toBeDefined()
    expect([focusedBackRowLabel]).toEqual(
      expect.arrayContaining([expect.stringMatching(/Gamma|Delta/)]),
    )
    expect(focusedBackRowLabel).not.toContain("Alpha")

    if (!refreshedSearchInput) {
      throw new Error("Expected row filter input after switching to the back card face.")
    }

    refreshedSearchInput.focus()
    refreshedSearchInput.value = "Gamma"
    refreshedSearchInput.dispatchEvent(new FakeDomEvent("input"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const gammaRow = findInteractiveRowByLabel(contentRoot, "[element] Gamma")
    if (!gammaRow) {
      throw new Error("Expected Gamma row while the back card face filter is active.")
    }

    expect(findInteractiveRowByLabel(contentRoot, "[element] Delta")).toBeUndefined()

    gammaRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(1)

    runtime.switchToView("front")
    app.refresh()
    await flushAsync(12)

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const restoredFrontSearchInput = findRowFilterInput(contentRoot)
    expect(restoredFrontSearchInput?.value).toBe("")
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Beta")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Gamma")).toBeUndefined()

    const selectedFrontRows = getSelectedRows(contentRoot)
    expect(selectedFrontRows.length).toBeLessThanOrEqual(1)
    expect(
      selectedFrontRows.every(
        (row) =>
          !((row as FakeDomElement & { ariaLabel?: string }).ariaLabel ?? "").includes("Gamma"),
      ),
    ).toBe(true)

    const focusedFrontRow = findFocusedInteractiveRow(contentRoot)
    const focusedFrontRowLabel = (
      focusedFrontRow as (FakeDomElement & { ariaLabel?: string }) | undefined
    )?.ariaLabel

    expect(focusedFrontRowLabel).toBeDefined()
    expect([focusedFrontRowLabel]).toEqual(
      expect.arrayContaining([expect.stringMatching(/Alpha|Beta/)]),
    )
    expect(focusedFrontRowLabel).not.toContain("Gamma")
  })

  it("keeps the shell inactive when stale scene changes arrive after a workspace switch to markdown", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
        "plain.md": {
          elements: [],
          frontmatter: {},
          viewType: "markdown",
        },
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)

    runtime.switchWorkspaceToView("plain.md")
    runtime.emitWorkspaceEvent("file-open")
    await flushAsync()

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expectInactiveSidepanelState(contentRoot, "Active leaf is not Excalidraw.")

    runtime.emitSceneChange({
      selectedElementIds: {
        A: true,
      },
    })
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expectInactiveSidepanelState(contentRoot, "Active leaf is not Excalidraw.")
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeUndefined()
  })

  it("marks markdown workspace switches inactive and records signal evidence even when metadata probing is unavailable", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
        "plain.md": {
          elements: [],
          frontmatter: {},
          viewType: "markdown",
        },
      },
      "A.excalidraw",
      {
        omitMetadataCache: true,
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)
    const setView = runtime.ea.setView as ReturnType<typeof vi.fn>
    setView.mockClear()

    const traceRead = globalRecord["LMX_HOST_CONTEXT_TRACE_READ"] as
      | (() => readonly {
          readonly category: string
          readonly message: string
          readonly payload: Record<string, unknown> | null
        }[])
      | undefined
    const traceClear = globalRecord["LMX_HOST_CONTEXT_TRACE_CLEAR"] as (() => void) | undefined

    traceClear?.()

    runtime.switchWorkspaceToView("plain.md")
    runtime.emitWorkspaceEvent("file-open")
    await flushAsync()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expectInactiveSidepanelState(contentRoot, "Active leaf is not Excalidraw.")
    expect(setView).not.toHaveBeenCalled()

    const signalEvent = traceRead?.().find(
      (event) => event.category === "signal" && event.message === "host-context signal reconciled",
    )

    expect(signalEvent?.payload).toEqual(
      expect.objectContaining({
        source: "workspace:file-open",
        scheduledRefresh: true,
        previousState: "live",
        nextState: "inactive",
        sceneRefSource: "active-leaf",
        activeFilePath: "plain.md",
        activeViewType: "markdown",
        targetViewFilePath: "A.excalidraw",
      }),
    )
  })

  it("stays inactive across markdown-only workspace note switches while stale Excalidraw authority remains bound", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
        "plain-a.md": {
          elements: [],
          frontmatter: {},
          viewType: "markdown",
        },
        "plain-b.md": {
          elements: [],
          frontmatter: {},
          viewType: "markdown",
        },
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)
    const setView = runtime.ea.setView as ReturnType<typeof vi.fn>
    setView.mockClear()

    runtime.switchWorkspaceToView("plain-a.md")
    runtime.emitWorkspaceEvent("file-open")
    await flushAsync()

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expectInactiveSidepanelState(contentRoot, "Active leaf is not Excalidraw.")
    expect(setView).not.toHaveBeenCalled()
    expect(runtime.ea.targetView).toEqual(
      expect.objectContaining({
        file: expect.objectContaining({
          path: "A.excalidraw",
        }),
      }),
    )

    runtime.switchWorkspaceToView("plain-b.md")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expectInactiveSidepanelState(contentRoot, "Active leaf is not Excalidraw.")
    expect(setView).not.toHaveBeenCalled()
    expect(runtime.ea.targetView).toEqual(
      expect.objectContaining({
        file: expect.objectContaining({
          path: "A.excalidraw",
        }),
      }),
    )

    runtime.emitSceneChange({
      selectedElementIds: {
        A: true,
      },
    })
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expectInactiveSidepanelState(contentRoot, "Active leaf is not Excalidraw.")
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeUndefined()
  })

  it("rebinds to the active workspace Excalidraw view before manual refresh reads", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [
          { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
          { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
        ],
        "B.excalidraw": [
          { id: "C", type: "rectangle", name: "Gamma", isDeleted: false },
          { id: "D", type: "rectangle", name: "Delta", isDeleted: false },
        ],
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    const app = createLayerManagerRuntime(runtime.ea)
    const setView = runtime.ea.setView as ReturnType<typeof vi.fn>
    setView.mockClear()

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const searchInput = findRowFilterInput(contentRoot)
    if (!searchInput) {
      throw new Error("Expected row filter input in the initial drawing.")
    }

    searchInput.focus()
    searchInput.value = "Alpha"
    searchInput.dispatchEvent(new FakeDomEvent("input"))
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const alphaRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")
    if (!alphaRow) {
      throw new Error("Expected Alpha row while the first drawing filter is active.")
    }

    alphaRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(1)

    runtime.switchWorkspaceToView("B.excalidraw")
    app.refresh()
    await flushAsync()

    expect(setView).toHaveBeenCalledTimes(1)

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const refreshedSearchInput = findRowFilterInput(contentRoot)
    expect(refreshedSearchInput?.value).toBe("")
    expect(findInteractiveRowByLabel(contentRoot, "[element] Gamma")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Delta")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeUndefined()
    expect(getSelectedRows(contentRoot)).toHaveLength(0)
  })

  it("records startup health when workspace refresh infrastructure is available", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
      },
      "A.excalidraw",
    )

    const app = createLayerManagerRuntime(runtime.ea)
    await flushAsync()

    const traceRead = globalRecord["LMX_HOST_CONTEXT_TRACE_READ"] as
      | (() => readonly {
          readonly message: string
          readonly payload: Record<string, unknown> | null
        }[])
      | undefined

    const startupEvent = traceRead?.().find(
      (event) => event.message === "workspace refresh infrastructure ready",
    )

    expect(startupEvent?.payload).toEqual(
      expect.objectContaining({
        runtimeAppResolved: true,
        hasWorkspace: true,
        hasWorkspaceOn: true,
        hasWorkspaceOffref: true,
        pollArmed: true,
        pollIntervalMs: 350,
        activeFilePath: "A.excalidraw",
        targetViewFilePath: "A.excalidraw",
      }),
    )

    app.dispose()
  })

  it("prefers the canonical ea.app workspace when targetView.app lacks workspace infrastructure", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
      },
      "A.excalidraw",
      {
        targetViewAppWorkspaceMode: "none",
      },
    )

    const app = createLayerManagerRuntime(runtime.ea)
    await flushAsync()

    const traceRead = globalRecord["LMX_HOST_CONTEXT_TRACE_READ"] as
      | (() => readonly {
          readonly message: string
          readonly payload: Record<string, unknown> | null
        }[])
      | undefined

    const startupEvent = traceRead?.().find(
      (event) => event.message === "workspace refresh infrastructure ready",
    )

    expect(startupEvent?.payload).toEqual(
      expect.objectContaining({
        runtimeAppResolved: true,
        hasWorkspace: true,
        hasWorkspaceOn: true,
        hasWorkspaceOffref: true,
        pollArmed: true,
        targetViewFilePath: "A.excalidraw",
      }),
    )

    app.dispose()
  })

  it("records startup health when workspace refresh infrastructure is unavailable", async () => {
    const traceRead = globalRecord["LMX_HOST_CONTEXT_TRACE_READ"] as
      | (() => readonly {
          readonly message: string
          readonly payload: Record<string, unknown> | null
        }[])
      | undefined

    const app = createLayerManagerRuntime(
      {
        targetView: null,
        setView: vi.fn(() => null),
        getViewElements: vi.fn(() => []),
        getViewSelectedElements: vi.fn(() => []),
        getScriptSettings: () => ({}),
        getExcalidrawAPI: vi.fn(() => null),
        createSidepanelTab: () => null,
        getSidepanelLeaf: () => ({
          detach: vi.fn(),
        }),
      } as unknown as EaLike,
      {
        render: vi.fn(),
        dispose: vi.fn(),
      },
    )
    await flushAsync()

    const startupEvent = traceRead?.().find(
      (event) => event.message === "workspace refresh infrastructure unavailable",
    )

    expect(startupEvent?.payload).toEqual(
      expect.objectContaining({
        runtimeAppResolved: false,
        hasWorkspace: false,
        hasWorkspaceOn: false,
        hasWorkspaceOffref: false,
        pollArmed: false,
      }),
    )

    app.dispose()
  })

  it("records renderer raw sidepanel view-change signals", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
      },
      "A.excalidraw",
    )

    const app = createLayerManagerRuntime(runtime.ea)
    await flushAsync()

    const traceRead = globalRecord["LMX_HOST_CONTEXT_TRACE_READ"] as
      | (() => readonly {
          readonly category: string
          readonly message: string
          readonly payload: Record<string, unknown> | null
        }[])
      | undefined
    const traceClear = globalRecord["LMX_HOST_CONTEXT_TRACE_CLEAR"] as (() => void) | undefined

    traceClear?.()

    const tabWithViewChange = runtime.sidepanelTab.tab as {
      onViewChange?: (targetView?: unknown | null) => void
    }
    tabWithViewChange.onViewChange?.(runtime.ea.targetView)
    await flushAsync()

    const rendererEvent = traceRead?.().find(
      (event) =>
        event.category === "renderer" && event.message === "sidepanel onViewChange received",
    )

    expect(rendererEvent?.payload).toEqual(
      expect.objectContaining({
        sceneBindingSource: "target-view",
        sceneBindingState: "live",
        sceneBindingShouldAttemptRebind: false,
        activeFilePath: "A.excalidraw",
        activeLeafIdentity: "A.excalidraw",
        activeViewType: "excalidraw",
        targetViewIdentity: "A.excalidraw",
        targetViewFilePath: "A.excalidraw",
        hostEligible: true,
      }),
    )

    app.dispose()
  })

  it("exposes host-context trace helpers and records cross-file rebind evidence", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
        "B.excalidraw": [{ id: "B", type: "rectangle", name: "Beta", isDeleted: false }],
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    const app = createLayerManagerRuntime(runtime.ea)
    const traceRead = globalRecord["LMX_HOST_CONTEXT_TRACE_READ"] as
      | (() => readonly {
          readonly category: string
          readonly message: string
          readonly payload: Record<string, unknown> | null
        }[])
      | undefined
    const traceClear = globalRecord["LMX_HOST_CONTEXT_TRACE_CLEAR"] as (() => void) | undefined
    const traceDump = globalRecord["LMX_HOST_CONTEXT_TRACE_DUMP"] as (() => string) | undefined

    expect(typeof traceRead).toBe("function")
    expect(typeof traceClear).toBe("function")
    expect(typeof traceDump).toBe("function")

    traceClear?.()

    runtime.switchWorkspaceToView("B.excalidraw")
    app.refresh()
    await flushAsync()

    const events = traceRead?.() ?? []
    const rebindMessages = events
      .filter((event) => event.category === "rebind")
      .map((event) => event.message)

    expect(rebindMessages).toEqual(
      expect.arrayContaining([
        "host view rebind requested",
        "host view rebind strategy attempted",
        "host view rebind confirmed",
      ]),
    )

    const confirmedEvent = events.find((event) => event.message === "host view rebind confirmed")
    expect(confirmedEvent?.payload).toEqual(
      expect.objectContaining({
        activeFilePath: "B.excalidraw",
        targetViewFilePath: "B.excalidraw",
      }),
    )
    expect(traceDump?.()).toContain("host view rebind confirmed")
  })

  it("renders an explicit inactive state when the active note is not Excalidraw-capable", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
        "plain.md": {
          elements: [],
          frontmatter: {},
        },
      },
      "A.excalidraw",
    )

    const app = createLayerManagerRuntime(runtime.ea)

    expect(runtime.sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

    runtime.switchToView("plain.md")
    app.refresh()
    await flushAsync()

    expect(runtime.detachLeaf).not.toHaveBeenCalled()
    expectInactiveSidepanelState(
      getContentRoot(runtime.sidepanelTab.contentEl),
      "Active leaf is not Excalidraw.",
    )
  })

  it("auto-refreshes host applicability from workspace note changes without rebinding an already-bound targetView", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
        "plain.md": {
          elements: [],
          frontmatter: {},
        },
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)
    const setView = runtime.ea.setView as ReturnType<typeof vi.fn>
    setView.mockClear()

    expect(runtime.sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

    runtime.switchWorkspaceToView("plain.md")
    runtime.emitWorkspaceEvent("file-open")
    await flushAsync()

    expect(runtime.detachLeaf).not.toHaveBeenCalled()
    expect(setView).not.toHaveBeenCalled()
    expectInactiveSidepanelState(
      getContentRoot(runtime.sidepanelTab.contentEl),
      "Active leaf is not Excalidraw.",
    )

    runtime.switchWorkspaceToView("A.excalidraw")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    expect(setView).not.toHaveBeenCalled()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
  })

  it("subscribes workspace note-change events from the canonical ea.app workspace", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
        "plain.md": {
          elements: [],
          frontmatter: {},
        },
      },
      "A.excalidraw",
      {
        requireSetViewForReadCalls: true,
        targetViewAppWorkspaceMode: "no-events",
      },
    )

    createLayerManagerRuntime(runtime.ea)
    expect(runtime.sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

    runtime.switchWorkspaceToView("plain.md")
    runtime.emitWorkspaceEvent("file-open")
    await flushAsync()

    expectInactiveSidepanelState(
      getContentRoot(runtime.sidepanelTab.contentEl),
      "Active leaf is not Excalidraw.",
    )
  })

  it("polls workspace active-file changes when workspace events are unavailable", async () => {
    vi.useFakeTimers()

    try {
      const runtime = makeRuntimeWithSidepanel(
        fakeDocument,
        {
          "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
          "plain.md": {
            elements: [],
            frontmatter: {},
          },
        },
        "A.excalidraw",
        {
          disableWorkspaceEvents: true,
          requireSetViewForReadCalls: true,
        },
      )

      createLayerManagerRuntime(runtime.ea)
      expect(runtime.sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

      runtime.switchWorkspaceToView("plain.md")
      await vi.advanceTimersByTimeAsync(500)
      await flushAsync()

      expect(runtime.detachLeaf).not.toHaveBeenCalled()
      expectInactiveSidepanelState(
        getContentRoot(runtime.sidepanelTab.contentEl),
        "Active leaf is not Excalidraw.",
      )

      runtime.switchWorkspaceToView("A.excalidraw")
      await vi.advanceTimersByTimeAsync(500)
      await flushAsync()

      const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("polls same-file leaf-context changes back out of unbound state when the file path stays stable", async () => {
    vi.useFakeTimers()

    try {
      const runtime = makeRuntimeWithSidepanel(
        fakeDocument,
        {
          markdown: {
            filePath: "Card.excalidraw",
            viewId: "Card.excalidraw#markdown",
            leafId: "card-leaf",
            viewType: "markdown",
            bindTargetView: false,
            frontmatter: {
              "excalidraw-plugin": "parsed",
            },
            elements: [],
          },
          excalidraw: {
            filePath: "Card.excalidraw",
            viewId: "Card.excalidraw#front",
            leafId: "card-leaf",
            viewType: "excalidraw",
            frontmatter: {
              "excalidraw-plugin": "parsed",
            },
            elements: [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
          },
        },
        "markdown",
        {
          disableWorkspaceEvents: true,
          requireSetViewForReadCalls: true,
        },
      )

      createLayerManagerRuntime(runtime.ea)

      expectUnboundSidepanelState(getContentRoot(runtime.sidepanelTab.contentEl))

      runtime.switchWorkspaceToView("excalidraw")
      await vi.advanceTimersByTimeAsync(500)
      await flushAsync()

      const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
      expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
      expect(findRowTreeRoot(contentRoot)).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it("derives workspace refresh app from targetView when ea.app is absent", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
        "plain.md": {
          elements: [],
          frontmatter: {},
        },
      },
      "A.excalidraw",
      {
        omitEaApp: true,
        requireSetViewForReadCalls: true,
      },
    )

    createLayerManagerRuntime(runtime.ea)
    expect(runtime.sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

    runtime.switchWorkspaceToView("plain.md")
    runtime.emitWorkspaceEvent("file-open")
    await flushAsync()

    expect(runtime.detachLeaf).not.toHaveBeenCalled()
    expectInactiveSidepanelState(
      getContentRoot(runtime.sidepanelTab.contentEl),
      "Active leaf is not Excalidraw.",
    )
  })

  it("does not call getExcalidrawAPI wrapper when targetView is unavailable during refresh", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [{ id: "A", type: "rectangle", name: "Alpha", isDeleted: false }],
      },
      "A.excalidraw",
      {
        requireSetViewForApiCalls: true,
      },
    )

    const app = createLayerManagerRuntime(runtime.ea)
    runtime.getExcalidrawAPI.mockClear()

    runtime.ea.setView = vi.fn(() => null)
    runtime.ea.targetView = null
    app.refresh()
    await flushAsync()

    expect(runtime.getExcalidrawAPI).not.toHaveBeenCalled()
  })

  it("reactivates cleanly after rendering an inactive host view state", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        "A.excalidraw": [
          { id: "A", type: "rectangle", name: "Alpha", isDeleted: false },
          { id: "B", type: "rectangle", name: "Beta", isDeleted: false },
        ],
        "plain.md": {
          elements: [],
          frontmatter: {},
        },
      },
      "A.excalidraw",
    )

    const app = createLayerManagerRuntime(runtime.ea)

    let contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const alphaRow = findInteractiveRowByLabel(contentRoot, "[element] Alpha")
    if (!alphaRow) {
      throw new Error("Expected Alpha row before inactive-host transition.")
    }

    alphaRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(1)

    runtime.switchToView("plain.md")
    app.refresh()
    await flushAsync()

    expect(runtime.detachLeaf).not.toHaveBeenCalled()
    expectInactiveSidepanelState(
      getContentRoot(runtime.sidepanelTab.contentEl),
      "Active leaf is not Excalidraw.",
    )

    runtime.switchToView("A.excalidraw")
    app.refresh()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Beta")).toBeDefined()
    expect(getSelectedRows(contentRoot).length).toBeLessThanOrEqual(1)
    expect(findFocusedInteractiveRow(contentRoot)).toBeUndefined()
  })
})
