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

  it("returns snapshot or override without consulting live reads when host view cannot be rebound", () => {
    const getViewSelectedElements = vi.fn(() => [{ id: "a" }])

    const result = reconcileSelectedElementIds({
      snapshotSelection: ["a"],
      selectionOverride: ["x"],
      getViewSelectedElements,
      hasSelectionBridge: true,
      ensureHostViewContext: () => false,
    })

    expect(result.source).toBe("hostViewUnavailable")
    expect(result.resolvedSelection).toEqual(["x"])
    expect(result.clearSelectionOverride).toBe(false)
    expect(getViewSelectedElements).not.toHaveBeenCalled()
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

  it("keeps local override while a host selection mirror is still pending", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: [],
      selectionOverride: ["x", "y"],
      getViewSelectedElements: () => [],
      hasSelectionBridge: true,
      hasPendingSelectionMirror: true,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("pendingMirrorKeepsOverride")
    expect(result.resolvedSelection).toEqual(["x", "y"])
    expect(result.clearSelectionOverride).toBe(false)
  })

  it("keeps pending local override even when stale live and snapshot selections still disagree", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["a"],
      selectionOverride: ["x"],
      getViewSelectedElements: () => [{ id: "a" }],
      hasSelectionBridge: true,
      hasPendingSelectionMirror: true,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("pendingMirrorKeepsOverride")
    expect(result.resolvedSelection).toEqual(["x"])
    expect(result.clearSelectionOverride).toBe(false)
  })

  it("keeps pending explicit empty selection while host clear is still in flight", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["a"],
      selectionOverride: [],
      getViewSelectedElements: () => [{ id: "a" }],
      hasSelectionBridge: true,
      hasPendingSelectionMirror: true,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("pendingMirrorKeepsOverride")
    expect(result.resolvedSelection).toEqual([])
    expect(result.clearSelectionOverride).toBe(false)
  })

  it("prefers snapshot selection when live selection is empty on a legacy host without a selection bridge", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["a", "b"],
      selectionOverride: null,
      getViewSelectedElements: () => [],
      hasSelectionBridge: false,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("snapshotPreferredOverEmptyLive")
    expect(result.resolvedSelection).toEqual(["a", "b"])
    expect(result.clearSelectionOverride).toBe(false)
  })

  it("treats explicit empty live selection as authoritative when the host bridge is active and no local row override exists", () => {
    const result = reconcileSelectedElementIds({
      snapshotSelection: ["b"],
      selectionOverride: null,
      getViewSelectedElements: () => [],
      hasSelectionBridge: true,
      ensureHostViewContext: () => true,
    })

    expect(result.source).toBe("liveDiffersFromSnapshot")
    expect(result.resolvedSelection).toEqual([])
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
