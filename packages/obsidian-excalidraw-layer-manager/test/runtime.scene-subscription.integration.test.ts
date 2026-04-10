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
