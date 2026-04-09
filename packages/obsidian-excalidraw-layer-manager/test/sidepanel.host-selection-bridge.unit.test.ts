import { describe, expect, it, vi } from "vitest"

import { SidepanelHostSelectionBridge } from "../src/ui/sidepanel/selection/hostSelectionBridge.js"

describe("sidepanel host selection bridge", () => {
  it("uses selectElementsInView when available and skips appState fallback on success", async () => {
    const suppressContentFocusOut = vi.fn<() => void>()
    const updateScene = vi.fn<(scene: unknown) => void>()

    let liveSelectionIds: readonly string[] = []

    const selectElementsInView = vi.fn<(ids: string[]) => void>((ids) => {
      liveSelectionIds = [...ids]
    })

    const bridge = new SidepanelHostSelectionBridge({
      host: {
        targetView: { _loaded: true },
        selectElementsInView,
        getViewSelectedElements: () => liveSelectionIds.map((id) => ({ id })),
        getExcalidrawAPI: () => ({ updateScene }),
      },
      suppressContentFocusOut,
    })

    bridge.mirrorSelectionToHost(["el:A", "el:B"])
    await Promise.resolve()

    expect(selectElementsInView).toHaveBeenCalledTimes(1)
    expect(selectElementsInView).toHaveBeenCalledWith(["el:A", "el:B"])
    expect(suppressContentFocusOut).toHaveBeenCalledTimes(1)
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
