import { describe, expect, it, vi } from "vitest"

import type {
  EaLike,
  ExcalidrawApiLike,
  RawExcalidrawElement,
} from "../src/adapter/excalidraw-types.js"
import { createLayerManagerRuntime } from "../src/main.js"

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("runtime scene-change subscription lifecycle", () => {
  it("unsubscribes from the previous API when the host API object changes", async () => {
    const elements: RawExcalidrawElement[] = [{ id: "A", type: "rectangle", isDeleted: false }]
    let selectedIds = new Set<string>()

    const listenersA = new Set<
      (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
    >()
    const listenersB = new Set<
      (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
    >()

    const apiA = {
      onChange: (
        callback: (
          elements: readonly RawExcalidrawElement[],
          appState: unknown,
          files: unknown,
        ) => void,
      ) => {
        listenersA.add(callback)
        return () => {
          listenersA.delete(callback)
        }
      },
    }

    const apiB = {
      onChange: (
        callback: (
          elements: readonly RawExcalidrawElement[],
          appState: unknown,
          files: unknown,
        ) => void,
      ) => {
        listenersB.add(callback)
        return () => {
          listenersB.delete(callback)
        }
      },
    }

    let currentApi: ExcalidrawApiLike = apiA
    const renderer = {
      render: vi.fn(),
      dispose: vi.fn(),
    }

    const ea: EaLike = {
      getViewElements: () => elements,
      getViewSelectedElements: () => elements.filter((element) => selectedIds.has(element.id)),
      getScriptSettings: () => ({}),
      getExcalidrawAPI: () => currentApi,
    }

    const runtime = createLayerManagerRuntime(ea, renderer)
    expect(listenersA.size).toBe(1)
    expect(listenersB.size).toBe(0)

    currentApi = apiB
    runtime.refresh()

    expect(listenersA.size).toBe(0)
    expect(listenersB.size).toBe(1)

    for (const callback of listenersB) {
      callback(elements, { selectedElementIds: { A: true } }, {})
    }

    selectedIds = new Set(["A"])
    await flushAsync()

    expect([...runtime.getSnapshot().selectedIds]).toEqual(["A"])
  })

  it("does not call getExcalidrawAPI wrapper when refresh lands on an unavailable targetView", async () => {
    const elements: RawExcalidrawElement[] = [{ id: "A", type: "rectangle", isDeleted: false }]
    const listeners = new Set<
      (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
    >()

    const api = {
      onChange: (
        callback: (
          elements: readonly RawExcalidrawElement[],
          appState: unknown,
          files: unknown,
        ) => void,
      ) => {
        listeners.add(callback)
        return () => {
          listeners.delete(callback)
        }
      },
    }

    const renderer = {
      render: vi.fn(),
      dispose: vi.fn(),
    }

    const ea: EaLike = {
      targetView: {
        id: "A.excalidraw",
        _loaded: true,
        excalidrawAPI: api,
      },
      setView: vi.fn(() => null),
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
      getScriptSettings: () => ({}),
      getExcalidrawAPI: vi.fn(function (this: EaLike) {
        const targetViewLoaded =
          this.targetView &&
          typeof this.targetView === "object" &&
          (this.targetView as { _loaded?: unknown })._loaded === true

        if (!targetViewLoaded) {
          throw new Error("targetView not set")
        }

        return api
      }),
    }

    const runtime = createLayerManagerRuntime(ea, renderer)
    const getExcalidrawAPI = ea.getExcalidrawAPI as ReturnType<typeof vi.fn>
    getExcalidrawAPI.mockClear()
    expect(listeners.size).toBe(1)

    ea.targetView = null
    runtime.refresh()
    await flushAsync()

    expect(getExcalidrawAPI).not.toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })

  it("does not call getExcalidrawAPI wrapper when explicit targetView is loaded but lacks direct api access", async () => {
    const elements: RawExcalidrawElement[] = [{ id: "A", type: "rectangle", isDeleted: false }]

    const renderer = {
      render: vi.fn(),
      dispose: vi.fn(),
    }

    const ea: EaLike = {
      targetView: {
        id: "A.excalidraw",
        _loaded: true,
      },
      setView: vi.fn(() => null),
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
      getScriptSettings: () => ({}),
      getExcalidrawAPI: vi.fn(() => {
        throw new Error("targetView not set")
      }),
    }

    createLayerManagerRuntime(ea, renderer)

    expect(ea.getExcalidrawAPI as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()
  })

  it("resubscribes when the workspace active file changes eligibility under a stable targetView", async () => {
    const elementsByView: Record<string, RawExcalidrawElement[]> = {
      "A.excalidraw": [{ id: "A", type: "rectangle", isDeleted: false }],
    }
    const selectedIdsByView = new Map<string, Set<string>>([["A.excalidraw", new Set<string>()]])
    let workspaceActiveFilePath = "A.excalidraw"
    let subscribeCount = 0
    let unsubscribeCount = 0

    const app = {
      metadataCache: {
        getFileCache: (file: unknown) => {
          const path =
            file &&
            typeof file === "object" &&
            typeof (file as { path?: unknown }).path === "string"
              ? ((file as { path: string }).path as string)
              : null

          if (path === "A.excalidraw") {
            return {
              frontmatter: {
                "excalidraw-plugin": "parsed",
              },
            }
          }

          if (path === "plain.md") {
            return {
              frontmatter: {},
            }
          }

          return null
        },
      },
      workspace: {
        getActiveFile: () => ({
          path: workspaceActiveFilePath,
        }),
      },
    }

    const listeners = new Set<
      (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
    >()

    const api = {
      onChange: (
        callback: (
          elements: readonly RawExcalidrawElement[],
          appState: unknown,
          files: unknown,
        ) => void,
      ) => {
        subscribeCount += 1
        listeners.add(callback)
        return () => {
          unsubscribeCount += 1
          listeners.delete(callback)
        }
      },
    }

    const currentView = {
      id: "A.excalidraw",
      _loaded: true,
      file: {
        path: "A.excalidraw",
      },
      app,
      excalidrawAPI: api,
    }

    const renderer = {
      render: vi.fn(),
      dispose: vi.fn(),
    }

    const ea: EaLike = {
      app,
      targetView: currentView,
      setView: vi.fn(() => currentView),
      getViewElements: () => elementsByView["A.excalidraw"] ?? [],
      getViewSelectedElements: () => {
        const selectedIds = selectedIdsByView.get("A.excalidraw") ?? new Set<string>()
        return (elementsByView["A.excalidraw"] ?? []).filter((element) =>
          selectedIds.has(element.id),
        )
      },
      getScriptSettings: () => ({}),
      getExcalidrawAPI: () => api,
    }

    const runtime = createLayerManagerRuntime(ea, renderer)
    const setView = ea.setView as ReturnType<typeof vi.fn>
    setView.mockClear()
    expect(subscribeCount).toBe(1)
    expect(unsubscribeCount).toBe(0)
    expect(listeners.size).toBe(1)

    for (const callback of listeners) {
      callback(elementsByView["A.excalidraw"] ?? [], { selectedElementIds: { A: true } }, {})
    }

    selectedIdsByView.set("A.excalidraw", new Set(["A"]))
    await flushAsync()
    expect([...runtime.getSnapshot().selectedIds]).toEqual(["A"])

    workspaceActiveFilePath = "plain.md"
    runtime.refresh()
    await flushAsync()

    expect(subscribeCount).toBe(2)
    expect(unsubscribeCount).toBe(1)
    expect(listeners.size).toBe(1)
    expect([...runtime.getSnapshot().selectedIds]).toEqual(["A"])
    expect(setView).not.toHaveBeenCalled()
  })

  it("resubscribes and clears stale selection hints when the targetView changes under a stable API", async () => {
    const elementsByView: Record<string, RawExcalidrawElement[]> = {
      "A.excalidraw": [{ id: "A", type: "rectangle", isDeleted: false }],
      "B.excalidraw": [{ id: "A", type: "rectangle", isDeleted: false }],
    }
    const selectedIdsByView = new Map<string, Set<string>>([
      ["A.excalidraw", new Set<string>()],
      ["B.excalidraw", new Set<string>()],
    ])
    const listenersByView = new Map<
      string,
      Set<(elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void>
    >()

    const getListenersForView = (viewPath: string) => {
      let listeners = listenersByView.get(viewPath)
      if (!listeners) {
        listeners = new Set()
        listenersByView.set(viewPath, listeners)
      }

      return listeners
    }

    const makeTargetView = (viewPath: string, excalidrawAPI?: unknown) => ({
      id: viewPath,
      _loaded: true,
      file: {
        path: viewPath,
      },
      ...(excalidrawAPI ? { excalidrawAPI } : {}),
    })

    let currentView = makeTargetView("A.excalidraw")
    const getCurrentViewPath = () => currentView.file.path

    const api = {
      onChange: (
        callback: (
          elements: readonly RawExcalidrawElement[],
          appState: unknown,
          files: unknown,
        ) => void,
      ) => {
        const listeners = getListenersForView(getCurrentViewPath())
        listeners.add(callback)
        return () => {
          listeners.delete(callback)
        }
      },
    }

    currentView = makeTargetView("A.excalidraw", api)

    const renderer = {
      render: vi.fn(),
      dispose: vi.fn(),
    }

    const ea: EaLike = {
      targetView: currentView,
      setView: vi.fn(() => currentView),
      getViewElements: () => elementsByView[getCurrentViewPath()] ?? [],
      getViewSelectedElements: () => {
        const selectedIds = selectedIdsByView.get(getCurrentViewPath()) ?? new Set<string>()
        return (elementsByView[getCurrentViewPath()] ?? []).filter((element) =>
          selectedIds.has(element.id),
        )
      },
      getScriptSettings: () => ({}),
      getExcalidrawAPI: () => api,
    }

    const runtime = createLayerManagerRuntime(ea, renderer)
    expect(getListenersForView("A.excalidraw").size).toBe(1)

    for (const callback of getListenersForView("A.excalidraw")) {
      callback(elementsByView["A.excalidraw"] ?? [], { selectedElementIds: { A: true } }, {})
    }

    await flushAsync()
    expect([...runtime.getSnapshot().selectedIds]).toEqual(["A"])

    currentView = makeTargetView("B.excalidraw", api)
    ea.targetView = currentView
    selectedIdsByView.set("B.excalidraw", new Set<string>())

    runtime.refresh()
    await flushAsync()

    expect(getListenersForView("A.excalidraw").size).toBe(0)
    expect(getListenersForView("B.excalidraw").size).toBe(1)
    expect([...runtime.getSnapshot().selectedIds]).toEqual([])
  })

  it("detaches the active subscription and disposes the renderer when the runtime is disposed", () => {
    const elements: RawExcalidrawElement[] = [{ id: "A", type: "rectangle", isDeleted: false }]
    const listeners = new Set<
      (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
    >()

    const renderer = {
      render: vi.fn(),
      dispose: vi.fn(),
    }

    const ea: EaLike = {
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
      getScriptSettings: () => ({}),
      getExcalidrawAPI: () => ({
        onChange: (callback) => {
          listeners.add(callback)
          return () => {
            listeners.delete(callback)
          }
        },
      }),
    }

    const runtime = createLayerManagerRuntime(ea, renderer)
    expect(listeners.size).toBe(1)

    runtime.dispose()

    expect(listeners.size).toBe(0)
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })

  it("drops queued external refresh work after dispose", async () => {
    const elements: RawExcalidrawElement[] = [{ id: "A", type: "rectangle", isDeleted: false }]
    const listeners = new Set<
      (elements: readonly RawExcalidrawElement[], appState: unknown, files: unknown) => void
    >()

    const renderer = {
      render: vi.fn(),
      dispose: vi.fn(),
    }

    const ea: EaLike = {
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
      getScriptSettings: () => ({}),
      getExcalidrawAPI: () => ({
        onChange: (callback) => {
          listeners.add(callback)
          return () => {
            listeners.delete(callback)
          }
        },
      }),
    }

    const runtime = createLayerManagerRuntime(ea, renderer)
    const renderCallCountBeforeDispose = renderer.render.mock.calls.length

    for (const callback of listeners) {
      callback(elements, { selectedElementIds: { A: true } }, {})
    }

    runtime.dispose()
    await flushAsync()

    expect(renderer.render).toHaveBeenCalledTimes(renderCallCountBeforeDispose)
  })
})
