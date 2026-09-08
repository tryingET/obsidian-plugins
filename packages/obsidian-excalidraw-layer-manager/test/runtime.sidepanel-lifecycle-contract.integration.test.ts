import { build } from "esbuild"

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

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
  readonly workspaceListenerCount: () => number
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
    workspaceListenerCount: () =>
      [...workspaceListeners.values()].reduce((sum, set) => sum + set.size, 0),
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
  let bundle: string

  beforeAll(async () => {
    const result = await build({
      entryPoints: ["src/main.ts"],
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      target: ["es2022"],
      legalComments: "none",
      sourcemap: false,
      charset: "utf8",
    })
    bundle = result.outputFiles[0]?.text ?? ""
    expect(bundle).not.toBe("")
  })

  beforeEach(() => {
    hadDocumentProperty = Object.hasOwn(globalRecord, "document")
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

  it("rolls back an initial renderer exception instead of leaking an errored actor", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const failure = new Error("initial render failed")
    const renderer = {
      render: vi.fn(() => {
        throw failure
      }),
      dispose: vi.fn(),
    }
    expect(() => createLayerManagerRuntime(fixture.ea, renderer)).toThrow(failure)
    await flushAsync(4)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    expect(fixture.workspaceListenerCount()).toBe(0)
    expect(fixture.getStaleSceneCallback()).toBeNull()
    expect(globalRecord["excalidrawLayerManagerRuntime"]).toBeUndefined()
  })

  it("does not publish or strand listeners when a host open callback throws", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    fixture.tab.open = () => {
      throw new Error("host open failed")
    }
    expect(() => new Function("ea", bundle)(fixture.ea)).toThrow("host open failed")
    await flushAsync(4)
    expect(fixture.workspaceListenerCount()).toBe(0)
    expect(fixture.getStaleSceneCallback()).toBeNull()
    expect(fixture.contentEl.children).toHaveLength(0)
    expect(fakeDocument.getListenerCount("keydown")).toBe(0)
    expect(globalRecord["excalidrawLayerManagerRuntime"]).toBeUndefined()
  })

  it("recovers initially missing API without another workspace event and cancels the readiness timer", async () => {
    vi.useFakeTimers()
    const fixture = makeRuntimeFixture(fakeDocument)
    const api = fixture.liveView["excalidrawAPI"]
    const readElements = fixture.ea.getViewElements
    fixture.ea.getExcalidrawAPI = () =>
      fixture.liveView["excalidrawAPI"] as ReturnType<NonNullable<EaLike["getExcalidrawAPI"]>>
    fixture.ea.getViewElements = () =>
      fixture.liveView["excalidrawAPI"] ? (readElements?.() ?? []) : []
    fixture.liveView["excalidrawAPI"] = null
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      expect(runtime.getSnapshot().elements).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(vi.getTimerCount()).toBe(1)
      fixture.liveView["excalidrawAPI"] = api
      await vi.advanceTimersByTimeAsync(2000)
      expect(runtime.getSnapshot().elements).toHaveLength(1)
      expect(fixture.subscribe).toHaveBeenCalledTimes(1)
      runtime.dispose()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      runtime.dispose()
      vi.useRealTimers()
    }
  })

  it("cancels initial API readiness on disposal and never subscribes later", async () => {
    vi.useFakeTimers()
    const fixture = makeRuntimeFixture(fakeDocument)
    const api = fixture.liveView["excalidrawAPI"]
    fixture.liveView["excalidrawAPI"] = null
    fixture.ea.getExcalidrawAPI = () =>
      fixture.liveView["excalidrawAPI"] as ReturnType<NonNullable<EaLike["getExcalidrawAPI"]>>
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      expect(vi.getTimerCount()).toBe(1)
      runtime.dispose()
      fixture.liveView["excalidrawAPI"] = api
      await vi.advanceTimersByTimeAsync(1000)
      expect(vi.getTimerCount()).toBe(0)
      expect(fixture.subscribe).not.toHaveBeenCalled()
      expect(fixture.workspaceListenerCount()).toBe(0)
    } finally {
      runtime.dispose()
      vi.useRealTimers()
    }
  })

  it("recovers a same-leaf replacement from file-open without a layout signal", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      fixture.tab.onExcalidrawViewClosed?.()
      const replacement = fixture.replaceLeafView()
      fixture.emitWorkspace("file-open")
      await flushAsync(10)
      expect(fixture.ea.targetView).toBe(replacement)
      expect(runtime.getSnapshot().elements).toHaveLength(1)
    } finally {
      runtime.dispose()
    }
  })

  it("keeps a bounded recovery armed when the layout signal still sees Markdown", async () => {
    vi.useFakeTimers()
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      fixture.tab.onExcalidrawViewClosed?.()
      const markdownView = fixture.replaceLeafView()
      markdownView["getViewType"] = () => "markdown"
      fixture.emitWorkspace("layout-change")
      const replacement = fixture.replaceLeafView()
      await vi.advanceTimersByTimeAsync(750)
      expect(fixture.ea.targetView).toBe(replacement)
      expect(runtime.getSnapshot().elements).toHaveLength(1)
    } finally {
      runtime.dispose()
      vi.useRealTimers()
    }
  })

  it("cancels slow recovery when the same leaf now contains an unrelated file", async () => {
    vi.useFakeTimers()
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      fixture.tab.onExcalidrawViewClosed?.()
      const replacement = fixture.replaceLeafView(false)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(vi.getTimerCount()).toBe(1)
      replacement["file"] = { path: "other.excalidraw.md" }
      replacement["_loaded"] = true
      await vi.advanceTimersByTimeAsync(2000)
      expect(vi.getTimerCount()).toBe(0)
      expect(fixture.ea.targetView).toBeNull()
      expect(runtime.getSnapshot().elements).toHaveLength(0)
    } finally {
      runtime.dispose()
      vi.useRealTimers()
    }
  })

  it("switches initial readiness authority to a replacement view instead of reviving the old view", async () => {
    vi.useFakeTimers()
    const fixture = makeRuntimeFixture(fakeDocument)
    const api = fixture.liveView["excalidrawAPI"]
    fixture.liveView["excalidrawAPI"] = null
    fixture.ea.getExcalidrawAPI = () =>
      (fixture.ea.targetView as { excalidrawAPI?: unknown } | null)?.excalidrawAPI as ReturnType<
        NonNullable<EaLike["getExcalidrawAPI"]>
      >
    fixture.ea.getViewElements = () =>
      fixture.ea.getExcalidrawAPI?.() ? [{ id: "replacement", type: "rectangle" }] : []
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      const replacement = fixture.replaceLeafView()
      replacement["excalidrawAPI"] = api
      fixture.ea.targetView = replacement
      await vi.advanceTimersByTimeAsync(750)
      expect(runtime.getSnapshot().elements.map((element) => element.id)).toEqual(["replacement"])
      expect(fixture.ea.targetView).toBe(replacement)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      runtime.dispose()
      vi.useRealTimers()
    }
  })

  it("does not publish an aborted startup from the generated script", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    fixture.tab.open = () => fixture.tab.onClose?.()
    new Function("ea", bundle)(fixture.ea)
    await flushAsync(10)
    expect(globalRecord["excalidrawLayerManagerRuntime"]).toBeUndefined()
    expect(fixture.contentEl.children).toHaveLength(0)
    expect(fixture.workspaceListenerCount()).toBe(0)
    expect(fakeDocument.getListenerCount("keydown")).toBe(0)
  })

  it("keeps a successor tab open when a fresh predecessor evaluation resolves late", async () => {
    const predecessor = makeRuntimeFixture(fakeDocument)
    let resolveTab: (tab: ExcalidrawSidepanelTabLike) => void = () => {}
    predecessor.createSidepanelTab.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTab = resolve
        }),
    )
    new Function("ea", bundle)(predecessor.ea)
    const successor = makeRuntimeFixture(fakeDocument)
    new Function("ea", bundle)(successor.ea)
    await flushAsync(10)
    const active = globalRecord["excalidrawLayerManagerRuntime"] as ReturnType<
      typeof createLayerManagerRuntime
    >
    // Host createTab resolves the same script-identity tab to the old invocation.
    predecessor.ea.sidepanelTab = successor.tab
    resolveTab(successor.tab)
    await flushAsync(10)
    try {
      expect(successor.tab.close).not.toHaveBeenCalled()
      expect(successor.ea.sidepanelTab).toBe(successor.tab)
      expect(active.isDisposed()).toBe(false)
      expect(hasText(successor.contentEl, "Alpha")).toBe(true)
    } finally {
      active.dispose()
    }
  })

  it.each(["predecessor-first", "successor-first"] as const)(
    "protects the native successor host while both creations are pending: %s",
    async (order) => {
      const predecessor = makeRuntimeFixture(fakeDocument)
      const successor = makeRuntimeFixture(fakeDocument)
      const plugin = {}
      Reflect.set(predecessor.ea, "plugin", plugin)
      Reflect.set(successor.ea, "plugin", plugin)
      predecessor.ea.activeScript = "LayerManager"
      successor.ea.activeScript = "LayerManager"
      let resolveOld: (tab: ExcalidrawSidepanelTabLike) => void = () => {}
      let resolveNew: (tab: ExcalidrawSidepanelTabLike) => void = () => {}
      predecessor.createSidepanelTab.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve
          }),
      )
      successor.createSidepanelTab.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve
          }),
      )
      new Function("ea", bundle)(predecessor.ea)
      new Function("ea", bundle)(successor.ea)
      const active = globalRecord["excalidrawLayerManagerRuntime"] as ReturnType<
        typeof createLayerManagerRuntime
      >
      const sharedTab = successor.tab
      // Native2.27.3 captures getHostEA at construction. Its private tabHosts
      // registry changes on reuse, but this public getter stays on predecessor.
      sharedTab.getHostEA = () => predecessor.ea
      try {
        if (order === "predecessor-first") {
          predecessor.ea.sidepanelTab = sharedTab
          resolveOld(sharedTab)
          await flushAsync(10)
          expect(sharedTab.close).not.toHaveBeenCalled()
          expect(active.isDisposed()).toBe(false)
          successor.ea.sidepanelTab = sharedTab
          resolveNew(sharedTab)
        } else {
          successor.ea.sidepanelTab = sharedTab
          resolveNew(sharedTab)
          await flushAsync(10)
          predecessor.ea.sidepanelTab = sharedTab
          resolveOld(sharedTab)
        }
        await flushAsync(10)
        expect(sharedTab.close).not.toHaveBeenCalled()
        expect(active.isDisposed()).toBe(false)
        expect(successor.ea.sidepanelTab).toBe(sharedTab)
        expect(hasText(successor.contentEl, "Alpha")).toBe(true)
      } finally {
        active.dispose()
      }
    },
  )

  it("ignores all retained hooks from a prior bundle after successor adoption", async () => {
    const old = makeRuntimeFixture(fakeDocument)
    new Function("ea", bundle)(old.ea)
    const saved = {
      open: old.tab.onOpen,
      focus: old.tab.onFocus,
      close: old.tab.onClose,
      viewClosed: old.tab.onExcalidrawViewClosed,
      migrated: old.tab.onWindowMigrated,
    }
    const successor = makeRuntimeFixture(fakeDocument)
    successor.ea.sidepanelTab = old.tab
    old.tab.getHostEA = () => successor.ea
    new Function("ea", bundle)(successor.ea)
    const active = globalRecord["excalidrawLayerManagerRuntime"] as ReturnType<
      typeof createLayerManagerRuntime
    >
    try {
      saved.open?.()
      saved.focus?.(old.liveView)
      saved.close?.()
      saved.viewClosed?.()
      saved.migrated?.({ document: fakeDocument } as unknown as Window)
      await flushAsync(10)
      expect(active.isDisposed()).toBe(false)
      expect(successor.ea.targetView).toBe(successor.liveView)
      expect(active.getSnapshot().elements).toHaveLength(1)
      expect(successor.workspaceListenerCount()).toBe(3)
      expect(old.workspaceListenerCount()).toBe(0)
    } finally {
      active.dispose()
    }
  })

  it.each(["close", "focus-close"] as const)(
    "rolls back startup when open synchronously invokes %s",
    async (event) => {
      const fixture = makeRuntimeFixture(fakeDocument)
      fixture.tab.open = () => {
        if (event === "focus-close") fixture.tab.onFocus?.(fixture.liveView)
        fixture.tab.onClose?.()
      }
      const runtime = createLayerManagerRuntime(fixture.ea)
      await flushAsync(10)
      try {
        await expect(runtime.apply({ elementPatches: [] })).rejects.toThrow("disposed")
        expect(fixture.contentEl.children).toHaveLength(0)
        expect(fixture.workspaceListenerCount()).toBe(0)
        expect(fixture.getStaleSceneCallback()).toBeNull()
        expect(fakeDocument.getListenerCount("keydown")).toBe(0)
      } finally {
        runtime.dispose()
      }
    },
  )

  it("keeps published snapshot versions increasing across release and refocus", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      fixture.tab.onFocus?.(null)
      for (let index = 0; index < 12; index += 1) runtime.refresh()
      const releasedVersion = runtime.getSnapshot().version
      fixture.tab.onFocus?.(fixture.liveView)
      await flushAsync(10)
      expect(runtime.getSnapshot().version).toBeGreaterThan(releasedVersion)
    } finally {
      runtime.dispose()
    }
  })

  it.each(["file-open", "layout-change"])(
    "refreshes a loaded view when its API first attaches via %s",
    async (event) => {
      const fixture = makeRuntimeFixture(fakeDocument)
      const api = fixture.liveView["excalidrawAPI"]
      const readElements = fixture.ea.getViewElements
      fixture.ea.getExcalidrawAPI = () =>
        fixture.liveView["excalidrawAPI"] as ReturnType<NonNullable<EaLike["getExcalidrawAPI"]>>
      fixture.ea.getViewElements = () =>
        fixture.liveView["excalidrawAPI"] ? (readElements?.() ?? []) : []
      fixture.liveView["excalidrawAPI"] = null
      const runtime = createLayerManagerRuntime(fixture.ea)
      try {
        expect(runtime.getSnapshot().elements).toHaveLength(0)
        fixture.liveView["excalidrawAPI"] = api
        fixture.emitWorkspace(event)
        await flushAsync(10)
        expect(runtime.getSnapshot().elements).toHaveLength(1)
        expect(fixture.subscribe).toHaveBeenCalledTimes(1)
      } finally {
        runtime.dispose()
      }
    },
  )

  it("refreshes a replacement view with the same file, leaf, and synthetic id", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      const original = fixture.liveView
      const replacement = fixture.replaceLeafView()
      replacement["id"] = original["id"]
      fixture.ea.targetView = replacement
      fixture.ea.getViewElements = () => [{ id: "B", type: "rectangle" }]
      fixture.emitWorkspace("file-open")
      await flushAsync(10)
      expect(runtime.getSnapshot().elements.map((element) => element.id)).toEqual(["B"])
      expect(fixture.unsubscribe).toHaveBeenCalledTimes(1)
      expect(fixture.subscribe).toHaveBeenCalledTimes(2)
    } finally {
      runtime.dispose()
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

  it("retains leaf and workspace through destructive unload and delayed API readiness", async () => {
    vi.useFakeTimers()
    const fixture = makeRuntimeFixture(fakeDocument)
    Reflect.deleteProperty(fixture.ea, "app")
    const runtime = createLayerManagerRuntime(fixture.ea)
    try {
      await flushAsync(10)
      fixture.tab.onExcalidrawViewClosed?.()
      const replacement = fixture.replaceLeafView()
      const api = replacement["excalidrawAPI"]
      replacement["excalidrawAPI"] = null
      Reflect.deleteProperty(fixture.liveView, "leaf")
      Reflect.deleteProperty(fixture.liveView, "app")
      fixture.emitWorkspace("layout-change")
      await flushAsync(10)
      expect(fixture.ea.targetView).toBeNull()
      replacement["excalidrawAPI"] = api
      await vi.advanceTimersByTimeAsync(350)
      expect(fixture.ea.targetView).toBe(replacement)
      expect(hasText(fixture.contentEl, "Alpha")).toBe(true)
      expect(fixture.subscribe).toHaveBeenCalledTimes(2)
      fixture.tab.onExcalidrawViewClosed?.()
      runtime.dispose()
      expect(fixture.workspaceListenerCount()).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      runtime.dispose()
      vi.useRealTimers()
    }
  })

  it("releases the original workspace after host authority is cleared", async () => {
    const fixture = makeRuntimeFixture(fakeDocument)
    Reflect.deleteProperty(fixture.ea, "app")
    const runtime = createLayerManagerRuntime(fixture.ea)
    await flushAsync(10)
    expect(fixture.workspaceListenerCount()).toBe(3)
    fixture.tab.onExcalidrawViewClosed?.()
    runtime.dispose()
    expect(fixture.workspaceListenerCount()).toBe(0)
  })

  it.each(["backoff", "close", "focus"])(
    "bounds readiness timer ownership and cancels on %s",
    async (finish) => {
      vi.useFakeTimers()
      const fixture = makeRuntimeFixture(fakeDocument)
      const runtime = createLayerManagerRuntime(fixture.ea)
      try {
        await flushAsync(10)
        fixture.tab.onExcalidrawViewClosed?.()
        const replacement = fixture.replaceLeafView(false)
        fixture.emitWorkspace("layout-change")
        fixture.emitWorkspace("layout-change")
        expect(vi.getTimerCount()).toBe(1)
        if (finish === "close") fixture.tab.onClose?.()
        else if (finish === "focus") fixture.tab.onFocus?.(fixture.liveView)
        await vi.advanceTimersByTimeAsync(10_000)
        expect(vi.getTimerCount()).toBe(finish === "backoff" ? 1 : 0)
        replacement["_loaded"] = true
        await vi.advanceTimersByTimeAsync(2000)
        if (finish === "backoff") {
          // Owner-authorized contract change: long readiness no longer requires
          // a new workspace event after the fast retry budget is exhausted.
          expect(fixture.ea.targetView).toBe(replacement)
        } else {
          expect(fixture.ea.targetView).not.toBe(replacement)
        }
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        runtime.dispose()
        vi.useRealTimers()
      }
    },
  )

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
