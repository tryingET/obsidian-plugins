import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  EaLike,
  ExcalidrawSidepanelTabLike,
  RawExcalidrawElement,
} from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"
import {
  FakeDocument,
  type FakeDomElement,
  flattenElements,
  flushAsync,
} from "./sidepanelTestHarness.js"

interface RuntimeFixture {
  readonly ea: EaLike
  readonly tab: ExcalidrawSidepanelTabLike
  readonly contentEl: FakeDomElement
  readonly createSidepanelTab: ReturnType<typeof vi.fn>
  readonly staleWorkspaceCallbacks: readonly (() => void)[]
  readonly getStaleSceneCallback: () =>
    | ((elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void)
    | null
  readonly switchWorkspace: (kind: "excalidraw" | "markdown") => void
  readonly replaceLeafView: (loaded?: boolean) => Record<string, unknown>
  readonly emitWorkspace: (event: string) => void
  readonly liveView: Record<string, unknown>
  readonly subscribe: ReturnType<typeof vi.fn>
  readonly unsubscribe: ReturnType<typeof vi.fn>
}

const makeRuntimeFixture = (document: FakeDocument): RuntimeFixture => {
  const contentEl = document.createElement("div")
  const elements: RawExcalidrawElement[] = [
    {
      id: "A",
      type: "rectangle",
      groupIds: [],
      frameId: null,
      opacity: 100,
      locked: false,
      isDeleted: false,
      customData: {
        lmx: {
          label: "Alpha",
        },
      },
    },
  ]

  let workspaceKind: "excalidraw" | "markdown" = "excalidraw"
  const workspaceListeners = new Map<string, Set<() => void>>()
  const staleWorkspaceCallbacks: (() => void)[] = []
  let sceneCallback:
    | ((elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void)
    | null = null

  let currentLeafView: unknown
  const leaf = {
    id: "leaf-A",
    get view() {
      return currentLeafView
    },
  }
  const workspace = {
    getMostRecentLeaf: () => leaf,
    on: (eventName: string, callback: () => void) => {
      let callbacks = workspaceListeners.get(eventName)
      if (!callbacks) {
        callbacks = new Set()
        workspaceListeners.set(eventName, callbacks)
      }
      callbacks.add(callback)
      staleWorkspaceCallbacks.push(callback)
      return { eventName, callback }
    },
    offref: (ref: unknown) => {
      if (!ref || typeof ref !== "object") {
        return
      }
      const eventName = (ref as { eventName?: unknown }).eventName
      const callback = (ref as { callback?: unknown }).callback
      if (typeof eventName === "string" && typeof callback === "function") {
        workspaceListeners.get(eventName)?.delete(callback as () => void)
      }
    },
    getActiveFile: () => ({
      path: workspaceKind === "excalidraw" ? "A.excalidraw.md" : "plain.md",
    }),
    get activeLeaf() {
      return leaf
    },
  }

  const metadataCache = {
    getFileCache: (file: unknown) => {
      const path =
        file && typeof file === "object" && typeof (file as { path?: unknown }).path === "string"
          ? (file as { path: string }).path
          : null
      return {
        frontmatter:
          path === "A.excalidraw.md"
            ? {
                "excalidraw-plugin": "parsed",
              }
            : {},
      }
    },
  }

  const app = {
    workspace,
    metadataCache,
  }

  const unsubscribe = vi.fn()
  const subscribe = vi.fn(
    (callback: NonNullable<ReturnType<RuntimeFixture["getStaleSceneCallback"]>>) => {
      sceneCallback = callback
      return () => {
        unsubscribe()
        if (sceneCallback === callback) sceneCallback = null
      }
    },
  )
  const api = { updateScene: vi.fn(), onChange: subscribe }

  const liveView = {
    excalidrawAPI: api,
    id: "view-A",
    getViewType: () => "excalidraw",
    _loaded: true,
    file: {
      path: "A.excalidraw.md",
    },
    leaf,
    app,
  }

  currentLeafView = liveView

  const tab: ExcalidrawSidepanelTabLike = {
    contentEl: contentEl as unknown as HTMLElement,
    setTitle: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    onOpen: vi.fn(),
    onFocus: vi.fn(),
    onClose: vi.fn(),
    onExcalidrawViewClosed: vi.fn(),
    onWindowMigrated: vi.fn(),
  }

  const ea: EaLike = {
    app,
    targetView: liveView,
    setView: vi.fn(function (this: EaLike, viewArg?: unknown) {
      if (viewArg === "active" || viewArg === undefined) {
        this.targetView = workspaceKind === "excalidraw" ? liveView : null
      } else {
        this.targetView = viewArg ?? null
      }
      return this.targetView
    }),
    getViewElements: () => (ea.targetView ? elements : []),
    getViewSelectedElements: () => [],
    getScriptSettings: () => ({}),
    getExcalidrawAPI: () => api,
    sidepanelTab: null,
  }

  tab.getHostEA = () => ea

  const createSidepanelTab = vi.fn(() => {
    ea.sidepanelTab = tab
    return tab
  })
  ea.createSidepanelTab = createSidepanelTab

  return {
    ea,
    tab,
    subscribe,
    unsubscribe,
    contentEl,
    createSidepanelTab,
    staleWorkspaceCallbacks,
    getStaleSceneCallback: () => sceneCallback,
    switchWorkspace: (kind) => {
      workspaceKind = kind
      currentLeafView =
        kind === "excalidraw"
          ? liveView
          : { getViewType: () => "markdown", file: { path: "plain.md" } }
    },
    replaceLeafView: (loaded = true) => {
      workspaceKind = "excalidraw"
      const replacement = { ...liveView, _loaded: loaded }
      currentLeafView = replacement
      return replacement
    },
    emitWorkspace: (event) => {
      for (const callback of workspaceListeners.get(event) ?? []) callback()
    },
    liveView,
  }
}

const hasText = (root: FakeDomElement, text: string): boolean => {
  return flattenElements(root).some((element) => element.textContent === text)
}

describe("runtime sidepanel lifecycle contract", () => {
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
    } else {
      Reflect.deleteProperty(globalRecord, "document")
    }
  })

  it("keeps user close terminal under stale workspace and scene callbacks", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    globalRecord["excalidrawLayerManagerRuntime"] = runtime
    await flushAsync(10)

    expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1)
    expect(fixture.contentEl.children.length).toBeGreaterThan(0)

    const staleSceneCallback = fixture.getStaleSceneCallback()
    fixture.tab.onClose?.()
    await flushAsync(6)

    for (const callback of fixture.staleWorkspaceCallbacks) {
      callback()
    }
    staleSceneCallback?.([], {}, {})
    await flushAsync(10)

    expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1)
    expect(fixture.contentEl.children).toHaveLength(0)
    await expect(runtime.apply({ elementPatches: [] })).rejects.toThrow(
      "Layer Manager runtime disposed.",
    )
    expect(globalRecord["excalidrawLayerManagerRuntime"]).toBeUndefined()
  })

  it("moves through unbound and live states via onFocus without rerunning", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    globalRecord["excalidrawLayerManagerRuntime"] = runtime
    await flushAsync(10)

    expect(hasText(fixture.contentEl, "Alpha")).toBe(true)

    fixture.switchWorkspace("markdown")
    fixture.tab.onFocus?.(null)
    await flushAsync(10)

    expect(hasText(fixture.contentEl, "Layer Manager inactive")).toBe(true)
    expect(hasText(fixture.contentEl, "Alpha")).toBe(false)

    fixture.switchWorkspace("excalidraw")
    fixture.tab.onFocus?.(fixture.liveView)
    await flushAsync(10)

    expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1)
    expect(hasText(fixture.contentEl, "Alpha")).toBe(true)

    runtime.dispose()
    if (globalRecord["excalidrawLayerManagerRuntime"] === runtime) {
      Reflect.deleteProperty(globalRecord, "excalidrawLayerManagerRuntime")
    }
  })

  it("treats associated view closure as non-terminal context loss", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    globalRecord["excalidrawLayerManagerRuntime"] = runtime
    await flushAsync(10)

    fixture.switchWorkspace("markdown")
    fixture.tab.onExcalidrawViewClosed?.()
    await flushAsync(10)

    expect(fixture.tab.close).not.toHaveBeenCalled()
    expect(hasText(fixture.contentEl, "Layer Manager inactive")).toBe(true)

    fixture.switchWorkspace("excalidraw")
    fixture.tab.onFocus?.(fixture.liveView)
    await flushAsync(10)

    expect(hasText(fixture.contentEl, "Alpha")).toBe(true)
    runtime.dispose()
    if (globalRecord["excalidrawLayerManagerRuntime"] === runtime) {
      Reflect.deleteProperty(globalRecord, "excalidrawLayerManagerRuntime")
    }
  })

  it("closes its own runtime without looking up or disposing another global runtime", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const otherRuntime = { dispose: vi.fn(), refresh: vi.fn() }
    globalRecord["excalidrawLayerManagerRuntime"] = otherRuntime
    const runtime = createLayerManagerRuntime(fixture.ea)
    await flushAsync(10)
    try {
      fixture.tab.onClose?.()
      await flushAsync(10)
      expect(otherRuntime.dispose).not.toHaveBeenCalled()
      expect(globalRecord["excalidrawLayerManagerRuntime"]).toBe(otherRuntime)
      expect(fixture.contentEl.children).toHaveLength(0)
      await expect(runtime.apply({ elementPatches: [] })).rejects.toThrow("disposed")
    } finally {
      runtime.dispose()
      Reflect.deleteProperty(globalRecord, "excalidrawLayerManagerRuntime")
    }
  })

  it("does not reacquire a drawing after onFocus(null) while workspace information is stale", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      await flushAsync(10)
      fixture.tab.onFocus?.(null)
      runtime.refresh()
      for (const callback of fixture.staleWorkspaceCallbacks) callback()
      await flushAsync(10)
      expect(fixture.ea.targetView).toBeNull()
      expect(hasText(fixture.contentEl, "Alpha")).toBe(false)
      fixture.tab.onFocus?.(fixture.liveView)
      await flushAsync(10)
      expect(hasText(fixture.contentEl, "Alpha")).toBe(true)
    } finally {
      runtime.dispose()
    }
  })

  it("recovers a distinct loaded same-leaf view on layout-change without a host focus hook", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      await flushAsync(10)
      fixture.tab.onExcalidrawViewClosed?.()
      fixture.emitWorkspace("layout-change")
      await flushAsync(10)
      expect(fixture.ea.targetView).toBeNull()
      const replacement = fixture.replaceLeafView(false)
      fixture.emitWorkspace("layout-change")
      await flushAsync(10)
      expect(fixture.ea.targetView).toBeNull()
      replacement["_loaded"] = true
      fixture.emitWorkspace("layout-change")
      await flushAsync(10)
      expect(fixture.ea.targetView).toBe(replacement)
      expect(hasText(fixture.contentEl, "Alpha")).toBe(true)
      expect(fixture.subscribe).toHaveBeenCalledTimes(2)
      fixture.emitWorkspace("layout-change")
      await flushAsync(10)
      expect(fixture.subscribe).toHaveBeenCalledTimes(2)
      expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1)
      fixture.tab.onClose?.()
      fixture.replaceLeafView()
      for (const callback of fixture.staleWorkspaceCallbacks) callback()
      await flushAsync(10)
      expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1)
      expect(fixture.contentEl.children).toHaveLength(0)
    } finally {
      runtime.dispose()
    }
  })

  it("registers a warm rerun through host creation/reuse rather than adopting a foreign EA tab", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    fixture.tab.getHostEA = () => ({ targetView: null })
    fixture.ea.checkForActiveSidepanelTabForScript = () => fixture.tab
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      await flushAsync(10)
      expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1)
      expect(fixture.ea.sidepanelTab).toBe(fixture.tab)
      expect(hasText(fixture.contentEl, "Alpha")).toBe(true)
      runtime.refresh()
      await flushAsync(10)
      expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1)
    } finally {
      runtime.dispose()
    }
  })

  it("explicit disposal clears only its own global reference", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    globalRecord["excalidrawLayerManagerRuntime"] = runtime
    runtime.dispose()
    expect(globalRecord["excalidrawLayerManagerRuntime"]).toBeUndefined()
    const replacement = { dispose: vi.fn(), refresh: vi.fn() }
    globalRecord["excalidrawLayerManagerRuntime"] = replacement
    runtime.dispose()
    expect(globalRecord["excalidrawLayerManagerRuntime"]).toBe(replacement)
    Reflect.deleteProperty(globalRecord, "excalidrawLayerManagerRuntime")
  })

  it("retained workspace callbacks do not rebind the EA after disposal", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    runtime.dispose()
    fixture.ea.targetView = null
    const setView = vi.mocked(fixture.ea.setView ?? vi.fn())
    setView.mockClear()
    for (const callback of fixture.staleWorkspaceCallbacks) callback()
    await flushAsync(10)
    expect(setView).not.toHaveBeenCalled()
    expect(fixture.ea.targetView).toBeNull()
  })

  it("repeated same-view focus retains one scene subscription, null releases it immediately", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      await flushAsync(10)
      expect(fixture.subscribe).toHaveBeenCalledTimes(1)
      fixture.tab.onFocus?.(fixture.liveView)
      fixture.tab.onFocus?.(fixture.liveView)
      await flushAsync(10)
      expect(fixture.subscribe).toHaveBeenCalledTimes(1)
      expect(fixture.unsubscribe).not.toHaveBeenCalled()
      fixture.tab.onFocus?.(null)
      expect(fixture.unsubscribe).toHaveBeenCalledTimes(1)
      const result = await runtime.commands.renameNode({ elementId: "A", nextName: "Blocked" })
      expect(result.status).toBe("capabilityMissing")
      fixture.tab.onFocus?.(fixture.liveView)
      await flushAsync(10)
      expect(fixture.subscribe).toHaveBeenCalledTimes(2)
    } finally {
      runtime.dispose()
    }
    expect(fixture.unsubscribe).toHaveBeenCalledTimes(2)
  })

  it("releases document listeners on migration and releases the new document on close", async () => {
    const oldRemove = vi.spyOn(fakeDocument, "removeEventListener")
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      await flushAsync(10)
      const newDocument = new FakeDocument()
      const newAdd = vi.spyOn(newDocument, "addEventListener")
      const newRemove = vi.spyOn(newDocument, "removeEventListener")
      // Obsidian adopts the existing DOM before sending onWindowMigrated.
      for (const element of flattenElements(fixture.contentEl))
        Reflect.set(element, "ownerDocument", newDocument)
      const win = { document: newDocument } as unknown as Window
      fixture.tab.onWindowMigrated?.(win)
      await flushAsync(10)
      expect(oldRemove.mock.calls.some(([name]) => name === "keydown")).toBe(true)
      expect(newAdd.mock.calls.some(([name]) => name === "keydown")).toBe(true)
      expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1)
      expect(hasText(fixture.contentEl, "Alpha")).toBe(true)
      fixture.tab.onClose?.()
      expect(newRemove.mock.calls.some(([name]) => name === "keydown")).toBe(true)
    } finally {
      runtime.dispose()
      oldRemove.mockRestore()
    }
  })
  it("ignores an old scene subscription even after rebinding the same API and drawing", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      await flushAsync(10)
      const oldCallback = fixture.getStaleSceneCallback()
      expect(oldCallback).not.toBeNull()
      fixture.tab.onFocus?.(null)
      fixture.tab.onFocus?.(fixture.liveView)
      await flushAsync(10)
      oldCallback?.([], { selectedElementIds: { A: true } }, {})
      await flushAsync(10)
      expect([...runtime.getSnapshot().selectedIds]).toEqual([])
      fixture.getStaleSceneCallback()?.([], { selectedElementIds: { A: true } }, {})
      await flushAsync(10)
      expect([...runtime.getSnapshot().selectedIds]).toEqual(["A"])
    } finally {
      runtime.dispose()
    }
  })

  it.each([false, true])(
    "cancels queued scene writes on focus loss, including refocus=%s",
    async (refocus) => {
      const fixture = makeRuntimeFixture(fakeDocument)
      const runtime = createLayerManagerRuntime(fixture.ea)
      try {
        await flushAsync(10)
        runtime.beginInteraction()
        const outcome = runtime.commands.renameNode({ elementId: "A", nextName: "Stale edit" })
        fixture.tab.onFocus?.(null)
        if (refocus) fixture.tab.onFocus?.(fixture.liveView)
        runtime.endInteraction()
        expect((await outcome).status).toBe("capabilityMissing")
        expect(fixture.ea.getExcalidrawAPI?.()?.updateScene).not.toHaveBeenCalled()
      } finally {
        runtime.dispose()
      }
    },
  )
})
