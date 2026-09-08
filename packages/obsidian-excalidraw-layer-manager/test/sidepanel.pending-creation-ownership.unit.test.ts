import { describe, expect, it, vi } from "vitest"

import { createSidepanelPendingCreationLease } from "../src/runtime/sidepanelPendingCreationOwnership.js"

const registryKey = Symbol.for("excalidraw-layer-manager.pending-sidepanel-creations.v1")

describe("sidepanel pending creation ownership", () => {
  it("defers predecessor cleanup until its successor can adopt the shared tab", () => {
    const plugin = {}
    const previous = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
    const current = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
    const close = vi.fn()
    let adopted = false
    previous.begin()
    previous.dispose()
    current.begin()
    previous.deferOrphan({}, () => {
      if (!adopted) close()
    })
    previous.settle()
    expect(close).not.toHaveBeenCalled()
    adopted = true
    current.settle()
    expect(close).not.toHaveBeenCalled()
    expect(Reflect.has(plugin, registryKey)).toBe(false)
    current.dispose()
  })

  it("still cleans a late orphan when there is no successor", () => {
    const plugin = {}
    const lease = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
    const close = vi.fn()
    lease.begin()
    lease.dispose()
    lease.deferOrphan({}, close)
    expect(close).toHaveBeenCalledTimes(1)
    lease.settle()
    expect(Reflect.has(plugin, registryKey)).toBe(false)
  })

  it.each(["settle", "dispose"] as const)(
    "cleans an unadopted orphan when the successor %s releases its pending claim",
    (method) => {
      const plugin = {}
      const previous = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
      const current = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
      const close = vi.fn()
      current.begin()
      previous.deferOrphan({}, close)
      expect(close).not.toHaveBeenCalled()
      current[method]()
      expect(close).toHaveBeenCalledTimes(1)
      expect(Reflect.has(plugin, registryKey)).toBe(false)
      previous.dispose()
      current.dispose()
    },
  )

  it.each(["plugin", "script"] as const)(
    "does not borrow protection from an unrelated %s",
    (difference) => {
      const plugin = {}
      const previous = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
      const unrelated = createSidepanelPendingCreationLease({
        plugin: difference === "plugin" ? {} : plugin,
        activeScript: difference === "script" ? "Sibling" : "LayerManager",
      })
      const close = vi.fn()
      unrelated.begin()
      previous.deferOrphan({}, close)
      expect(close).toHaveBeenCalledTimes(1)
      unrelated.dispose()
      previous.dispose()
      expect(Reflect.has(plugin, registryKey)).toBe(false)
    },
  )

  it.each([true, false])(
    "retains a replacement same-key entry after nested settlement (shared registry=%s)",
    (keepRegistryAlive) => {
      const plugin = {}
      const other = createSidepanelPendingCreationLease({ plugin, activeScript: "Other" })
      const previous = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
      const next = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
      const close = vi.fn()
      if (keepRegistryAlive) other.begin()
      previous.begin()
      previous.deferOrphan({}, () => {
        previous.dispose()
        next.begin()
      })
      previous.settle()
      previous.deferOrphan({}, close)
      expect(close).not.toHaveBeenCalled()
      next.settle()
      expect(close).toHaveBeenCalledTimes(1)
      other.dispose()
      next.dispose()
      expect(Reflect.has(plugin, registryKey)).toBe(false)
    },
  )

  it("rechecks ownership when orphan cleanup itself starts a new invocation", () => {
    const plugin = {}
    const original = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
    const reentrant = createSidepanelPendingCreationLease({ plugin, activeScript: "LayerManager" })
    const closeSecond = vi.fn()
    original.begin()
    original.deferOrphan({}, () => reentrant.begin())
    original.deferOrphan({}, closeSecond)
    original.settle()
    expect(closeSecond).not.toHaveBeenCalled()
    reentrant.settle()
    expect(closeSecond).toHaveBeenCalledTimes(1)
    expect(Reflect.has(plugin, registryKey)).toBe(false)
    original.dispose()
    reentrant.dispose()
  })
})
