import { describe, expect, it, vi } from "vitest"

import type { EaLike, ExcalidrawSidepanelTabLike } from "../src/adapter/excalidraw-types.js"
import { createRuntimeSidepanelLifecycleBinding } from "../src/runtime/sidepanelLifecycleBinding.js"
import { SidepanelMountManager } from "../src/ui/sidepanel/mount/sidepanelMountManager.js"
import { FakeDocument } from "./sidepanelTestHarness.js"

const flushAsync = async (turns = 4): Promise<void> => {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve()
  }
}

const makeTab = (): ExcalidrawSidepanelTabLike => ({
  open: vi.fn(),
  close: vi.fn(),
  onOpen: vi.fn(),
  onFocus: vi.fn(),
  onClose: vi.fn(),
  onExcalidrawViewClosed: vi.fn(),
  onWindowMigrated: vi.fn(),
})

describe("runtime sidepanel lifecycle binding", () => {
  it("binds focus, view-close, and user-close to distinct runtime outcomes", () => {
    const tab = makeTab()
    const previousOnFocus = tab.onFocus
    const previousOnClose = tab.onClose
    const previousOnExcalidrawViewClosed = tab.onExcalidrawViewClosed
    const requestRefresh = vi.fn()
    const requestDispose = vi.fn()
    const ea: EaLike = {
      targetView: null,
      sidepanelTab: tab,
      setView: vi.fn(function (this: EaLike, view?: unknown) {
        this.targetView = view ?? null
        return this.targetView
      }),
    }

    const binding = createRuntimeSidepanelLifecycleBinding({
      ea,
      requestRefresh,
      requestDispose,
    })

    const liveView = { id: "live-view", _loaded: true }
    tab.onFocus?.(liveView)

    expect(previousOnFocus).toHaveBeenCalledWith(liveView)
    expect(ea.setView).toHaveBeenCalledWith(liveView, false)
    expect(ea.targetView).toBe(liveView)
    expect(requestRefresh).toHaveBeenCalledTimes(1)
    expect(requestDispose).not.toHaveBeenCalled()

    tab.onExcalidrawViewClosed?.()

    expect(previousOnExcalidrawViewClosed).toHaveBeenCalledTimes(1)
    expect(ea.setView).toHaveBeenLastCalledWith(null, false)
    expect(ea.targetView).toBeNull()
    expect(requestRefresh).toHaveBeenCalledTimes(2)
    expect(requestDispose).not.toHaveBeenCalled()

    tab.onClose?.()

    expect(previousOnClose).toHaveBeenCalledTimes(1)
    expect(requestDispose).toHaveBeenCalledTimes(1)

    binding.dispose()

    expect(tab.onFocus).toBe(previousOnFocus)
    expect(tab.onClose).toBe(previousOnClose)
    expect(tab.onExcalidrawViewClosed).toBe(previousOnExcalidrawViewClosed)
  })

  it("releases a superseded tab without letting stale close dispose the runtime", () => {
    const first = makeTab()
    const second = makeTab()
    const firstPreviousClose = first.onClose
    const secondPreviousClose = second.onClose
    const requestDispose = vi.fn()
    const ea: EaLike = {
      targetView: null,
      sidepanelTab: first,
    }

    const binding = createRuntimeSidepanelLifecycleBinding({
      ea,
      requestRefresh: vi.fn(),
      requestDispose,
    })

    const firstInstalledClose = first.onClose
    ea.sidepanelTab = second
    binding.sync()

    expect(first.onClose).toBe(firstPreviousClose)
    firstInstalledClose?.()
    expect(requestDispose).not.toHaveBeenCalled()

    first.onClose?.()
    expect(requestDispose).not.toHaveBeenCalled()

    second.onClose?.()
    expect(secondPreviousClose).toHaveBeenCalledTimes(1)
    expect(requestDispose).toHaveBeenCalledTimes(1)
  })

  it("preserves hooks installed by a later owner", () => {
    const tab = makeTab()
    const ea: EaLike = {
      sidepanelTab: tab,
    }
    const binding = createRuntimeSidepanelLifecycleBinding({
      ea,
      requestRefresh: vi.fn(),
      requestDispose: vi.fn(),
    })

    const replacementViewClosed = vi.fn()
    tab.onExcalidrawViewClosed = replacementViewClosed

    binding.sync()
    tab.onExcalidrawViewClosed?.()

    expect(replacementViewClosed).toHaveBeenCalledTimes(1)
    expect(tab.onExcalidrawViewClosed).toBe(replacementViewClosed)
    binding.dispose()
    expect(tab.onExcalidrawViewClosed).toBe(replacementViewClosed)
  })

  it("closes a tab whose asynchronous creation resolves after disposal", async () => {
    let resolveTab!: (tab: ExcalidrawSidepanelTabLike | null) => void
    const created = new Promise<ExcalidrawSidepanelTabLike | null>((resolve) => {
      resolveTab = resolve
    })
    const originalCreateSidepanelTab = vi.fn(() => created)
    const ea: EaLike = {
      createSidepanelTab: originalCreateSidepanelTab,
      sidepanelTab: null,
    }

    const manager = new SidepanelMountManager({
      host: ea,
      title: "Layer Manager",
      notify: vi.fn(),
      debugLifecycle: vi.fn(),
      onTabSwitched: vi.fn(),
      onAsyncTabResolved: vi.fn(),
      onPersistedTabDetected: vi.fn(),
    })
    manager.prepareMount({ resolveExistingContentRoot: () => null, onSetContentFailure: vi.fn() })
    manager.dispose()

    const tab = {
      ...makeTab(),
      contentEl: new FakeDocument().createElement("div") as unknown as HTMLElement,
    }
    ea.sidepanelTab = tab
    resolveTab(tab)
    await created
    await flushAsync()

    expect(tab.close).toHaveBeenCalledTimes(1)
    expect(ea.sidepanelTab).toBeNull()
    expect(ea.createSidepanelTab).toBe(originalCreateSidepanelTab)
  })
})
