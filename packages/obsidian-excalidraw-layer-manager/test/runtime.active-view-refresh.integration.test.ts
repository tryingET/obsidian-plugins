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
  flushAsync,
  getContentRoot,
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
  readonly sidepanelTab: SidepanelTabHarness
  readonly switchToView: (viewPath: string) => void
  readonly switchWorkspaceToView: (viewPath: string) => void
  readonly emitWorkspaceEvent: (eventName?: string) => void
}

type DrawingFixture =
  | readonly RawExcalidrawElement[]
  | {
      readonly elements: readonly RawExcalidrawElement[]
      readonly frontmatter?: Record<string, unknown>
    }

const isArrayDrawingFixture = (
  fixture: DrawingFixture,
): fixture is readonly RawExcalidrawElement[] => {
  return Array.isArray(fixture)
}

const normalizeDrawingFixture = (
  fixture: DrawingFixture,
): {
  readonly elements: readonly RawExcalidrawElement[]
  readonly frontmatter: Record<string, unknown>
} => {
  if (isArrayDrawingFixture(fixture)) {
    return {
      elements: fixture,
      frontmatter: {
        "excalidraw-plugin": "parsed",
      },
    }
  }

  return {
    elements: fixture.elements,
    frontmatter: fixture.frontmatter ?? {},
  }
}

interface MakeRuntimeWithSidepanelOptions {
  readonly disableWorkspaceEvents?: boolean
  readonly omitEaApp?: boolean
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
      normalizeDrawingFixture(fixture),
    ]),
  )
  const drawingByPath = new Map(
    [...normalizedByPath.entries()].map(([viewPath, fixture]) => [
      viewPath,
      {
        elements: fixture.elements.map(cloneElement),
        selectedIds: new Set<string>(),
      },
    ]),
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

        const fixture = normalizedByPath.get(path)
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
        path: activeViewPath,
      }),
    },
  }
  const viewByPath = new Map(
    [...normalizedByPath.keys()].map((viewPath) => [
      viewPath,
      {
        id: viewPath,
        _loaded: true,
        file: {
          path: viewPath,
        },
        app,
      },
    ]),
  )

  let activeViewPath = initialViewPath
  const workspaceListeners = new Map<string, Set<(...args: unknown[]) => unknown>>()
  const sidepanelTab = makeSidepanelTab(document, null)
  const sceneChangeListeners = new Set<
    (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
  >()

  const getBoundViewPath = (): string => {
    const path =
      ea.targetView &&
      typeof ea.targetView === "object" &&
      typeof (ea.targetView as { file?: { path?: unknown } }).file?.path === "string"
        ? ((ea.targetView as { file: { path: string } }).file.path as string)
        : activeViewPath

    return path
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

  const ea: EaLike = {
    ...(options.omitEaApp ? {} : { app }),
    targetView: viewByPath.get(activeViewPath) ?? null,
    setView: vi.fn((viewArg?: unknown) => {
      if (viewArg === "active" || viewArg === undefined) {
        ea.targetView = viewByPath.get(activeViewPath) ?? null
      }

      return ea.targetView
    }),
    getViewElements: () => getCurrentDrawing().elements,
    getViewSelectedElements: () => {
      const drawing = getCurrentDrawing()
      return drawing.elements.filter((element) => drawing.selectedIds.has(element.id))
    },
    selectElementsInView: vi.fn((ids: readonly string[]) => {
      setSelectedIds(ids)
    }),
    getScriptSettings: () => ({}),
    getExcalidrawAPI: () => ({
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
    }),
    sidepanelTab: null,
    createSidepanelTab: () => sidepanelTab.tab,
  }

  sidepanelTab.tab.getHostEA = () => ea

  return {
    ea,
    sidepanelTab,
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

  it("closes and clears the sidepanel when the active note is not Excalidraw-capable", async () => {
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

    expect(runtime.sidepanelTab.close).toHaveBeenCalledTimes(1)
    expect(runtime.sidepanelTab.contentEl.children).toHaveLength(0)
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
    )

    createLayerManagerRuntime(runtime.ea)

    expect(runtime.sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

    runtime.switchWorkspaceToView("plain.md")
    runtime.emitWorkspaceEvent("file-open")
    await flushAsync()

    expect(runtime.sidepanelTab.close).toHaveBeenCalledTimes(1)
    expect(runtime.sidepanelTab.contentEl.children).toHaveLength(0)

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
        },
      )

      createLayerManagerRuntime(runtime.ea)
      expect(runtime.sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

      runtime.switchWorkspaceToView("plain.md")
      await vi.advanceTimersByTimeAsync(500)
      await flushAsync()

      expect(runtime.sidepanelTab.close).toHaveBeenCalledTimes(1)
      expect(runtime.sidepanelTab.contentEl.children).toHaveLength(0)

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
      },
    )

    createLayerManagerRuntime(runtime.ea)
    expect(runtime.sidepanelTab.contentEl.children.length).toBeGreaterThan(0)

    runtime.switchWorkspaceToView("plain.md")
    runtime.emitWorkspaceEvent("file-open")
    await flushAsync()

    expect(runtime.sidepanelTab.close).toHaveBeenCalledTimes(1)
    expect(runtime.sidepanelTab.contentEl.children).toHaveLength(0)
  })

  it("remounts cleanly after tearing down an ineligible host view", async () => {
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
      throw new Error("Expected Alpha row before ineligible-host teardown.")
    }

    alphaRow.click()
    await flushAsync()

    contentRoot = getContentRoot(runtime.sidepanelTab.contentEl)
    expect(getSelectedRows(contentRoot)).toHaveLength(1)

    runtime.switchToView("plain.md")
    app.refresh()
    await flushAsync()

    expect(runtime.sidepanelTab.close).toHaveBeenCalledTimes(1)
    expect(runtime.sidepanelTab.contentEl.children).toHaveLength(0)

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
