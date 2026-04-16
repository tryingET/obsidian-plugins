import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EaLike, RawExcalidrawElement } from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"

import {
  FakeDocument,
  type FakeDomElement,
  FakeDomEvent,
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

interface RuntimeWithSidepanel {
  readonly ea: EaLike
  readonly sidepanelTab: SidepanelTabHarness
  readonly getExcalidrawAPI: ReturnType<typeof vi.fn>
  readonly detachLeaf: ReturnType<typeof vi.fn>
  readonly switchToView: (viewPath: string) => void
  readonly switchWorkspaceToView: (viewPath: string) => void
  readonly emitWorkspaceEvent: (eventName?: string) => void
}

type DrawingFixture =
  | readonly RawExcalidrawElement[]
  | {
      readonly elements: readonly RawExcalidrawElement[]
      readonly frontmatter?: Record<string, unknown>
      readonly filePath?: string
      readonly viewId?: string
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
  readonly viewId: string
} => {
  if (isArrayDrawingFixture(fixture)) {
    return {
      elements: fixture,
      frontmatter: {
        "excalidraw-plugin": "parsed",
      },
      filePath: viewPath,
      viewId: viewPath,
    }
  }

  return {
    elements: fixture.elements,
    frontmatter: fixture.frontmatter ?? {},
    filePath: fixture.filePath ?? viewPath,
    viewId: fixture.viewId ?? viewPath,
  }
}

interface MakeRuntimeWithSidepanelOptions {
  readonly disableWorkspaceEvents?: boolean
  readonly omitEaApp?: boolean
  readonly requireSetViewForReadCalls?: boolean
  readonly requireSetViewForApiCalls?: boolean
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

  const app = {
    metadataCache: {
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
    },
    workspace: {
      ...(options.disableWorkspaceEvents
        ? {}
        : {
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
          }),
      getActiveFile: () => ({
        path: normalizedByPath.get(activeViewPath)?.filePath ?? activeViewPath,
      }),
    },
  }

  const viewByPath = new Map(
    [...normalizedByPath.entries()].map(([viewPath, fixture]) => [
      viewPath,
      {
        id: fixture.viewId,
        _loaded: true,
        file: {
          path: fixture.filePath,
        },
        app,
      },
    ]),
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

  const ea: EaLike = {
    ...(options.omitEaApp ? {} : { app }),
    targetView: viewByPath.get(activeViewPath) ?? null,
    setView: vi.fn((viewArg?: unknown) => {
      if (viewArg === "active" || viewArg === undefined) {
        ea.targetView = viewByPath.get(activeViewPath) ?? null
      }

      return ea.targetView
    }),
    getViewElements: () => {
      if (options.requireSetViewForReadCalls === true && !hasFreshViewBinding()) {
        throw new Error("targetView not set")
      }

      return getCurrentDrawing().elements
    },
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
  })

  afterEach(() => {
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

  it("treats same-file targetView identity switches as active-view changes", async () => {
    const runtime = makeRuntimeWithSidepanel(
      fakeDocument,
      {
        front: {
          filePath: "Card.excalidraw",
          viewId: "Card.excalidraw#front",
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

    const focusedRow = findFocusedInteractiveRow(contentRoot)
    const focusedRowLabel = (focusedRow as (FakeDomElement & { ariaLabel?: string }) | undefined)
      ?.ariaLabel

    expect(focusedRowLabel).toBeDefined()
    expect([focusedRowLabel]).toEqual(
      expect.arrayContaining([expect.stringMatching(/Gamma|Delta/)]),
    )
    expect(focusedRowLabel).not.toContain("Alpha")
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

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    const refreshedSearchInput = findRowFilterInput(contentRoot)
    expect(refreshedSearchInput?.value).toBe("")
    expect(findInteractiveRowByLabel(contentRoot, "[element] Gamma")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Delta")).toBeDefined()
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeUndefined()
    expect(getSelectedRows(contentRoot)).toHaveLength(0)
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

  it("auto-refreshes host applicability from workspace note changes", async () => {
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

    expect(runtime.sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

    runtime.switchWorkspaceToView("plain.md")
    runtime.emitWorkspaceEvent("file-open")
    await flushAsync()

    expect(runtime.detachLeaf).not.toHaveBeenCalled()
    expectInactiveSidepanelState(
      getContentRoot(runtime.sidepanelTab.contentEl),
      "Active leaf is not Excalidraw.",
    )

    runtime.switchWorkspaceToView("A.excalidraw")
    runtime.emitWorkspaceEvent("active-leaf-change")
    await flushAsync()

    const contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(findInteractiveRowByLabel(contentRoot, "[element] Alpha")).toBeDefined()
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

    const focusedRow = findFocusedInteractiveRow(contentRoot)
    const focusedRowLabel = (focusedRow as (FakeDomElement & { ariaLabel?: string }) | undefined)
      ?.ariaLabel

    expect(focusedRowLabel).toBeDefined()
    expect([focusedRowLabel]).toEqual(expect.arrayContaining([expect.stringMatching(/Alpha|Beta/)]))
  })
})
