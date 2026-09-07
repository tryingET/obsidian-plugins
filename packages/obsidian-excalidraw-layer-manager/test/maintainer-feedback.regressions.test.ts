import { describe, expect, it, vi } from "vitest"

import type { EaLike, ExcalidrawSidepanelTabLike } from "../src/adapter/excalidraw-types.js"
import { planRenameNode } from "../src/commands/renameNode.js"
import { createRuntimeSidepanelLifecycleBinding } from "../src/runtime/sidepanelLifecycleBinding.js"
import { makeCommandContext, makeElement } from "./testFixtures.js"

describe("maintainer-feedback behavioral regressions", () => {
  it("ordinary rename emits no name patch and preserves opaque custom data", () => {
    const customData = {
      foreign: { keep: true },
      lmx: { future: 42, groupLabels: { G: "Group" } },
    }
    const context = makeCommandContext([makeElement({ id: "A", name: "Legacy", customData })])
    const plan = planRenameNode(context, {
      elementId: "A",
      nextName: "  New  ",
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.value.elementPatches[0]?.set).toEqual({
      customData: { ...customData, lmx: { ...customData.lmx, label: "New" } },
    })
    expect(context.snapshot.elements[0]?.name).toBe("Legacy")
  })

  it("frame rename emits only native name, leaving legacy metadata untouched", () => {
    const context = makeCommandContext([
      makeElement({
        id: "F",
        type: "frame",
        name: "Native",
        customData: { lmx: { label: "Legacy" } },
      }),
    ])
    const plan = planRenameNode(context, { elementId: "F", nextName: "New" })
    expect(plan.ok).toBe(true)
    if (!plan.ok) throw new Error(plan.error)
    expect(plan.value.elementPatches[0]?.set).toEqual({ name: "New" })
  })

  it("composes view closure with the original tab receiver and restores it", () => {
    let receivedThis: unknown
    const previous = vi.fn(function (this: unknown) {
      receivedThis = this
    })
    const tab: ExcalidrawSidepanelTabLike = {
      onExcalidrawViewClosed: previous,
    }
    const ea: EaLike = {
      getViewElements: () => [],
      sidepanelTab: tab,
      targetView: {},
    }
    const requestRefresh = vi.fn()
    const binding = createRuntimeSidepanelLifecycleBinding({
      ea,
      requestRefresh,
      requestDispose: vi.fn(),
    })
    try {
      tab.onExcalidrawViewClosed?.()
      expect(previous).toHaveBeenCalledTimes(1)
      expect(receivedThis).toBe(tab)
      expect(ea.targetView).toBeNull()
      expect(requestRefresh).toHaveBeenCalledTimes(1)
    } finally {
      binding.dispose()
    }
    expect(tab.onExcalidrawViewClosed).toBe(previous)
  })

  it("preserves the onOpen promise and receiver while requesting refresh", async () => {
    let receivedThis: unknown
    const pending = Promise.resolve()
    const tab: ExcalidrawSidepanelTabLike = {
      onOpen: function () {
        receivedThis = this
        return pending
      },
    }
    const ea: EaLike = { getViewElements: () => [], sidepanelTab: tab }
    const requestRefresh = vi.fn()
    const binding = createRuntimeSidepanelLifecycleBinding({
      ea,
      requestRefresh,
      requestDispose: vi.fn(),
    })
    try {
      const result = tab.onOpen?.()
      expect(receivedThis).toBe(tab)
      expect(result).toBe(pending)
      await result
      expect(requestRefresh).toHaveBeenCalledTimes(1)
    } finally {
      binding.dispose()
    }
  })

  it("does not recursively rewrap a hook composed by a later owner", () => {
    const tab: ExcalidrawSidepanelTabLike = { onFocus: vi.fn() }
    const ea: EaLike = { getViewElements: () => [], sidepanelTab: tab }
    const requestRefresh = vi.fn()
    const binding = createRuntimeSidepanelLifecycleBinding({
      ea,
      requestRefresh,
      requestDispose: vi.fn(),
    })
    const originalBinding = tab.onFocus
    const later = vi.fn((view: unknown) => originalBinding?.(view))
    tab.onFocus = later
    try {
      binding.sync()
      expect(tab.onFocus).toBe(later)
      tab.onFocus(null)
      expect(requestRefresh).toHaveBeenCalledTimes(1)
      binding.dispose()
      expect(tab.onFocus).toBe(later)
      tab.onFocus({})
      expect(requestRefresh).toHaveBeenCalledTimes(1)
    } finally {
      binding.dispose()
    }
  })

  it("a retained close handler is terminal even when the previous callback throws", () => {
    const error = new Error("host close failed")
    const tab: ExcalidrawSidepanelTabLike = {
      onClose: () => {
        throw error
      },
    }
    const requestDispose = vi.fn()
    const binding = createRuntimeSidepanelLifecycleBinding({
      ea: { sidepanelTab: tab },
      requestRefresh: vi.fn(),
      requestDispose,
    })
    const close = tab.onClose
    try {
      expect(() => close?.()).toThrow(error)
      expect(() => close?.()).not.toThrow()
      expect(requestDispose).toHaveBeenCalledTimes(1)
    } finally {
      binding.dispose()
    }
  })
  it.each(["onFocus", "onClose", "onExcalidrawViewClosed", "onWindowMigrated"] as const)(
    "preserves a prior %s callback's actual asynchronous return",
    async (hook) => {
      const pending = Promise.resolve()
      const tab: ExcalidrawSidepanelTabLike = { [hook]: () => pending }
      const binding = createRuntimeSidepanelLifecycleBinding({
        ea: { sidepanelTab: tab },
        requestRefresh: vi.fn(),
        requestDispose: vi.fn(),
      })
      try {
        const callback = tab[hook] as (...args: unknown[]) => unknown
        expect(callback.call(tab, hook === "onWindowMigrated" ? {} : null)).toBe(pending)
        await pending
      } finally {
        binding.dispose()
      }
    },
  )
})
