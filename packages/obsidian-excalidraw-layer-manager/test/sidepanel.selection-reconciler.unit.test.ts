import { describe, expect, it, vi } from "vitest"

import { reconcileSelectedElementIds } from "../src/ui/sidepanel/selection/selectionReconciler.js"

describe("sidepanel selection reconciler", () => {
  it("falls back to override/snapshot when live selection API is unavailable", () => {
    const withOverride = reconcileSelectedElementIds({
      snapshotSelection: ["a"],
      selectionOverride: ["b"],
      hasSelectionBridge: false,
      ensureHostViewContext: () => true,
    })

    expect(withOverride.source).toBe("noLiveSelectionApi")
    expect(withOverride.resolvedSelection).toEqual(["b"])
    expect(withOverride.clearSelectionOverride).toBe(false)

    const withoutOverride = reconcileSelectedElementIds({
      snapshotSelection: ["a"],
      selectionOverride: null,
      hasSelectionBridge: false,
      ensureHostViewContext: () => true,
    })

    expect(withoutOverride.source).toBe("noLiveSelectionApi")
    expect(withoutOverride.resolvedSelection).toEqual(["a"])
    expect(withoutOverride.clearSelectionOverride).toBe(false)
  })

  it("returns live selection when it matches local override", () => {
    const ensureHostViewContext = vi.fn(() => true)

    const result = reconcileSelectedElementIds({
      snapshotSelection: ["a", "b"],
      selectionOverride: ["b", "a"],
      getViewSelectedElements: () => [{ id: "b" }, { id: "a" }],
      hasSelectionBridge: true,
      ensureHostViewContext,
    })

    expect(result.source).toBe("liveMatchesOverride")
    expect(result.resolvedSelection).toEqual(["b", "a"])
    expect(result.clearSelectionOverride).toBe(false)
    expect(ensureHostViewContext).toHaveBeenCalledTimes(1)
  })

  it("keeps local override when host bridge is unavailable and live selection is empty", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["a"],
      selectionOverride: ["x", "y"],
      getViewSelectedElements: () => [],
      hasSelectionBridge: false,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("overrideWithoutBridgeFallback")
    expect(result.resolvedSelection).toEqual(["x", "y"])
    expect(result.clearSelectionOverride).toBe(false)
  })

  it("prefers snapshot selection when live selection is unexpectedly empty", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["a", "b"],
      selectionOverride: null,
      getViewSelectedElements: () => [],
      hasSelectionBridge: true,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("snapshotPreferredOverEmptyLive")
    expect(result.resolvedSelection).toEqual(["a", "b"])
    expect(result.clearSelectionOverride).toBe(false)
  })

  it("clears stale override when live selection is empty but snapshot has newer ids", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["b"],
      selectionOverride: ["a"],
      getViewSelectedElements: () => [],
      hasSelectionBridge: true,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("snapshotPreferredOverEmptyLive")
    expect(result.resolvedSelection).toEqual(["b"])
    expect(result.clearSelectionOverride).toBe(true)
  })

  it("clears stale override when live selection matches snapshot", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["b"],
      selectionOverride: ["a"],
      getViewSelectedElements: () => [{ id: "b" }],
      hasSelectionBridge: true,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("snapshotOrOverrideFallback")
    expect(result.resolvedSelection).toEqual(["b"])
    expect(result.clearSelectionOverride).toBe(true)
  })

  it("adopts live selection and requests override clear when live differs from snapshot", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["a", "b"],
      selectionOverride: ["b", "a"],
      getViewSelectedElements: () => [{ id: "z" }],
      hasSelectionBridge: true,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("liveDiffersFromSnapshot")
    expect(result.resolvedSelection).toEqual(["z"])
    expect(result.clearSelectionOverride).toBe(true)
  })

  it("returns fallback selection with readErrorMessage when live read throws", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["a"],
      selectionOverride: ["x"],
      getViewSelectedElements: () => {
        throw new Error("boom")
      },
      hasSelectionBridge: true,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("snapshotOrOverrideFallback")
    expect(result.resolvedSelection).toEqual(["x"])
    expect(result.clearSelectionOverride).toBe(false)
    expect(result.readErrorMessage).toBe("boom")
  })
})
