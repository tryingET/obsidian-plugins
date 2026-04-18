import { describe, expect, it, vi } from "vitest"

import { SidepanelHostSelectionBridge } from "../src/ui/sidepanel/selection/hostSelectionBridge.js"

describe("sidepanel host selection bridge", () => {
  it("tracks pending mirror state until selection verification completes", async () => {
    const bridge = new SidepanelHostSelectionBridge({
      host: {
        targetView: { _loaded: true },
        selectElementsInView: () => {},
        getViewSelectedElements: () => [{ id: "el:A" }],
      },
      suppressContentFocusOut: () => {},
    })

    bridge.mirrorSelectionToHost(["el:A"])
    expect(bridge.hasPendingSelectionMirror()).toBe(true)

    await Promise.resolve()

    expect(bridge.hasPendingSelectionMirror()).toBe(false)
  })

  it("uses selectElementsInView when available and skips appState fallback on success", async () => {
    const suppressContentFocusOut = vi.fn<() => void>()
    const updateScene = vi.fn<(scene: unknown) => void>()
    const setView = vi.fn<(view?: unknown, reveal?: boolean) => unknown>()

    let liveSelectionIds: readonly string[] = []

    const selectElementsInView = vi.fn<(ids: string[]) => void>((ids) => {
      liveSelectionIds = [...ids]
    })

    const bridge = new SidepanelHostSelectionBridge({
      host: {
        targetView: { _loaded: true },
        setView,
        selectElementsInView,
        getViewSelectedElements: () => liveSelectionIds.map((id) => ({ id })),
        getExcalidrawAPI: () => ({ updateScene }),
      },
      suppressContentFocusOut,
    })

    bridge.mirrorSelectionToHost(["el:A", "el:B"])
    await Promise.resolve()

    expect(setView).not.toHaveBeenCalled()
    expect(selectElementsInView).toHaveBeenCalledTimes(1)
    expect(selectElementsInView).toHaveBeenCalledWith(["el:A", "el:B"])
    expect(suppressContentFocusOut).toHaveBeenCalledTimes(1)
    expect(updateScene).not.toHaveBeenCalled()
  })

  it("accepts targetView rebinding when setView mutates host targetView but returns null", async () => {
    const suppressContentFocusOut = vi.fn<() => void>()
    const updateScene = vi.fn<(scene: unknown) => void>()

    let liveSelectionIds: readonly string[] = []

    const host: {
      targetView: unknown | null
      setView: ReturnType<typeof vi.fn>
      selectElementsInView: ReturnType<typeof vi.fn>
      getViewSelectedElements: () => readonly { id: string }[]
      getExcalidrawAPI: () => { updateScene: typeof updateScene }
    } = {
      targetView: null,
      setView: vi.fn(() => {
        host.targetView = { id: "rebound-view", _loaded: true }
        return null
      }),
      selectElementsInView: vi.fn((ids: readonly string[]) => {
        liveSelectionIds = [...ids]
      }),
      getViewSelectedElements: () => liveSelectionIds.map((id) => ({ id })),
      getExcalidrawAPI: () => ({ updateScene }),
    }

    const bridge = new SidepanelHostSelectionBridge({
      host,
      suppressContentFocusOut,
    })

    bridge.mirrorSelectionToHost(["el:A"])
    await Promise.resolve()

    expect(host.setView).toHaveBeenCalledTimes(1)
    expect(host.selectElementsInView).toHaveBeenCalledTimes(1)
    expect(host.selectElementsInView).toHaveBeenCalledWith(["el:A"])
    expect(updateScene).not.toHaveBeenCalled()
  })

  it("falls back to updateScene appState when selection bridge is unavailable", () => {
    const suppressContentFocusOut = vi.fn<() => void>()
    const updateScene = vi.fn<(scene: unknown) => void>()

    const bridge = new SidepanelHostSelectionBridge({
      host: {
        getExcalidrawAPI: () => ({ updateScene }),
      },
      suppressContentFocusOut,
    })

    bridge.mirrorSelectionToHost(["el:A"])

    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(updateScene).toHaveBeenCalledWith({
      appState: {
        selectedElementIds: {
          "el:A": true,
        },
      },
    })
    expect(suppressContentFocusOut).not.toHaveBeenCalled()
  })

  it("requires exact live-selection match before clearing pending mirror state", async () => {
    const suppressContentFocusOut = vi.fn<() => void>()
    const updateScene = vi.fn<(scene: unknown) => void>()
    const selectElementsInView = vi.fn<(ids: string[]) => void>()

    const bridge = new SidepanelHostSelectionBridge({
      host: {
        targetView: { _loaded: true },
        selectElementsInView,
        getViewSelectedElements: () => [{ id: "el:A" }, { id: "el:B" }],
        getExcalidrawAPI: () => ({ updateScene }),
      },
      suppressContentFocusOut,
    })

    bridge.mirrorSelectionToHost(["el:A"])
    await Promise.resolve()

    expect(selectElementsInView).toHaveBeenCalledTimes(2)
    expect(updateScene).toHaveBeenCalledTimes(1)
  })

  it("retries selection bridge once and then falls back to updateScene on verification mismatch", async () => {
    const suppressContentFocusOut = vi.fn<() => void>()
    const updateScene = vi.fn<(scene: unknown) => void>()

    const selectElementsInView = vi.fn<(ids: string[]) => void>()

    const bridge = new SidepanelHostSelectionBridge({
      host: {
        targetView: { _loaded: true },
        selectElementsInView,
        getViewSelectedElements: () => [],
        getExcalidrawAPI: () => ({ updateScene }),
      },
      suppressContentFocusOut,
    })

    bridge.mirrorSelectionToHost(["el:A"])
    await Promise.resolve()

    expect(selectElementsInView).toHaveBeenCalledTimes(2)
    expect(suppressContentFocusOut).toHaveBeenCalledTimes(2)
    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(updateScene).toHaveBeenCalledWith({
      appState: {
        selectedElementIds: {
          "el:A": true,
        },
      },
    })
  })

  it("keeps pending mirror state when fallback cannot be verified", async () => {
    const updateScene = vi.fn<(scene: unknown) => void>()
    const selectElementsInView = vi.fn<(ids: string[]) => void>(() => {
      throw new Error("bridge unavailable")
    })

    const bridge = new SidepanelHostSelectionBridge({
      host: {
        targetView: { _loaded: true },
        selectElementsInView,
        getViewSelectedElements: () => [],
        getExcalidrawAPI: () => ({ updateScene }),
      },
      suppressContentFocusOut: () => {},
    })

    bridge.mirrorSelectionToHost(["el:A"])
    expect(bridge.hasPendingSelectionMirror()).toBe(true)

    await Promise.resolve()

    expect(updateScene).toHaveBeenCalledTimes(2)
    expect(bridge.hasPendingSelectionMirror()).toBe(true)
  })

  it("invalidates pending verification so stale retries cannot override newer selection", async () => {
    const suppressContentFocusOut = vi.fn<() => void>()
    const updateScene = vi.fn<(scene: unknown) => void>()
    const selectElementsInView = vi.fn<(ids: string[]) => void>()

    const bridge = new SidepanelHostSelectionBridge({
      host: {
        targetView: { _loaded: true },
        selectElementsInView,
        getViewSelectedElements: () => [],
        getExcalidrawAPI: () => ({ updateScene }),
      },
      suppressContentFocusOut,
    })

    bridge.mirrorSelectionToHost(["el:A"])
    bridge.invalidatePendingSelectionMirror()
    bridge.mirrorSelectionToHost(["el:B"])
    await Promise.resolve()

    expect(selectElementsInView).toHaveBeenCalledWith(["el:A"])
    expect(selectElementsInView).toHaveBeenCalledWith(["el:B"])
    expect(selectElementsInView).toHaveBeenCalledTimes(3)
    expect(updateScene).toHaveBeenCalledTimes(1)
    expect(updateScene).toHaveBeenCalledWith({
      appState: {
        selectedElementIds: {
          "el:B": true,
        },
      },
    })
  })
})
