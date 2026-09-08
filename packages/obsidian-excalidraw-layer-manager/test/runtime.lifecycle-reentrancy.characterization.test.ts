import { describe, expect, it, vi } from "vitest"

import type { EaLike, ExcalidrawSidepanelTabLike } from "../src/adapter/excalidraw-types.js"
import {
  createRuntimeSidepanelLifecycleBinding,
  hasSidepanelLifecycleOwner,
} from "../src/runtime/sidepanelLifecycleBinding.js"

describe("sidepanel lifecycle ownership characterization", () => {
  it("restores descriptors and removes ownership when the host removes its tab", () => {
    const previousOpen = vi.fn()
    const tab: ExcalidrawSidepanelTabLike = { open: vi.fn(), close: vi.fn() }
    Object.defineProperty(tab, "onOpen", {
      value: previousOpen,
      writable: true,
      configurable: true,
      enumerable: false,
    })
    const descriptor = Object.getOwnPropertyDescriptor(tab, "onOpen")
    const ea: EaLike = { sidepanelTab: tab }
    const binding = createRuntimeSidepanelLifecycleBinding({
      ea,
      requestRefresh: vi.fn(),
      requestDispose: vi.fn(),
    })
    expect(hasSidepanelLifecycleOwner(tab)).toBe(true)
    ea.sidepanelTab = null
    binding.sync()
    expect(hasSidepanelLifecycleOwner(tab)).toBe(false)
    expect(Object.getOwnPropertyDescriptor(tab, "onOpen")).toEqual(descriptor)
    expect(Object.hasOwn(tab, "onFocus")).toBe(false)
    ea.sidepanelTab = tab
    binding.sync()
    expect(hasSidepanelLifecycleOwner(tab)).toBe(true)
    binding.dispose()
    binding.dispose()
    binding.sync()
    expect(hasSidepanelLifecycleOwner(tab)).toBe(false)
    expect(tab.onOpen).toBe(previousOpen)
  })

  it.each(["release", "dispose"] as const)(
    "makes every retained hook inert after %s",
    (operation) => {
      const previous = vi.fn()
      const tab: ExcalidrawSidepanelTabLike = {
        open: vi.fn(),
        close: vi.fn(),
        onOpen: previous,
        onFocus: previous,
        onClose: previous,
        onExcalidrawViewClosed: previous,
        onWindowMigrated: previous,
      }
      const requestRefresh = vi.fn()
      const requestDispose = vi.fn()
      const onFocus = vi.fn()
      const onWindowMigrated = vi.fn()
      const originalView = { id: "original" }
      const ea: EaLike = { sidepanelTab: tab, targetView: originalView }
      const binding = createRuntimeSidepanelLifecycleBinding({
        ea,
        requestRefresh,
        requestDispose,
        onFocus,
        onWindowMigrated,
      })
      const retained = { ...tab }
      binding[operation]()
      retained.onOpen?.()
      retained.onFocus?.({ id: "late" })
      retained.onExcalidrawViewClosed?.()
      retained.onWindowMigrated?.({} as Window)
      retained.onClose?.()
      expect(previous).not.toHaveBeenCalled()
      expect(requestRefresh).not.toHaveBeenCalled()
      expect(requestDispose).not.toHaveBeenCalled()
      expect(onFocus).not.toHaveBeenCalled()
      expect(onWindowMigrated).not.toHaveBeenCalled()
      expect(ea.targetView).toBe(originalView)
      expect(hasSidepanelLifecycleOwner(tab)).toBe(false)
    },
  )

  it.each(["onOpen", "onFocus", "onExcalidrawViewClosed", "onWindowMigrated"] as const)(
    "preserves %s return identity but skips follow-up work if the previous hook disposes synchronously",
    (hook) => {
      const returned = Promise.resolve()
      let dispose = (): void => {}
      const previous = vi.fn(function (this: ExcalidrawSidepanelTabLike) {
        expect(this).toBe(tab)
        dispose()
        return returned
      })
      const tab: ExcalidrawSidepanelTabLike = { open: vi.fn(), close: vi.fn(), [hook]: previous }
      const originalView = { id: "original" }
      const ea: EaLike = { sidepanelTab: tab, targetView: originalView, setView: vi.fn() }
      const requestRefresh = vi.fn()
      const onFocus = vi.fn()
      const onWindowMigrated = vi.fn()
      const binding = createRuntimeSidepanelLifecycleBinding({
        ea,
        requestRefresh,
        requestDispose: vi.fn(),
        onFocus,
        onWindowMigrated,
      })
      dispose = binding.dispose
      const argument = {} as Window
      const result = tab[hook]?.(argument)
      expect(result).toBe(returned)
      expect(previous).toHaveBeenCalledTimes(1)
      if (hook === "onFocus" || hook === "onWindowMigrated") {
        expect(previous).toHaveBeenCalledWith(argument)
      } else {
        expect(previous).toHaveBeenCalledWith()
      }
      expect(ea.targetView).toBe(originalView)
      expect(ea.setView).not.toHaveBeenCalled()
      expect(requestRefresh).not.toHaveBeenCalled()
      expect(onFocus).not.toHaveBeenCalled()
      expect(onWindowMigrated).not.toHaveBeenCalled()
      expect(tab[hook]).toBe(previous)
      expect(hasSidepanelLifecycleOwner(tab)).toBe(false)
    },
  )
})
