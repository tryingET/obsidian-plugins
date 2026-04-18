import { describe, expect, it, vi } from "vitest"

import { SidepanelMountManager } from "../src/ui/sidepanel/mount/sidepanelMountManager.js"

import { FakeDocument, makeSidepanelTabForMountMode } from "./sidepanelTestHarness.js"

describe("sidepanel mount manager", () => {
  it("tracks attach retries after a failed prepareMount attempt", () => {
    const notify = vi.fn<(message: string) => void>()
    const manager = new SidepanelMountManager({
      host: {
        sidepanelTab: null,
        createSidepanelTab: () => undefined,
      },
      title: "Layer Manager",
      notify,
      debugLifecycle: vi.fn(),
      onTabSwitched: vi.fn(),
      onAsyncTabResolved: vi.fn(),
      onPersistedTabDetected: vi.fn(),
    })

    const resolveExistingContentRoot = () => null
    const onSetContentFailure = vi.fn<() => void>()

    expect(
      manager.prepareMount({
        resolveExistingContentRoot,
        onSetContentFailure,
      }),
    ).toEqual({
      status: "unavailable",
    })
    expect(manager.mountTelemetry).toEqual({
      attachCount: 0,
      attachFailureCount: 1,
      attachRetryCount: 0,
    })

    expect(
      manager.prepareMount({
        resolveExistingContentRoot,
        onSetContentFailure,
      }),
    ).toEqual({
      status: "unavailable",
    })
    expect(manager.mountTelemetry).toEqual({
      attachCount: 0,
      attachFailureCount: 2,
      attachRetryCount: 1,
    })
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("reopens a newly adopted persisted tab when it differs from the prior active tab", () => {
    const fakeDocument = new FakeDocument()
    const initialTab = makeSidepanelTabForMountMode(fakeDocument, null, "contentEl")
    const adoptedTab = makeSidepanelTabForMountMode(fakeDocument, null, "contentEl")
    const onTabSwitched = vi.fn<() => void>()

    const host: {
      sidepanelTab: typeof initialTab.tab | null
      closeSidepanelTab: ReturnType<typeof vi.fn>
    } = {
      sidepanelTab: initialTab.tab,
      closeSidepanelTab: vi.fn(),
    }

    const manager = new SidepanelMountManager({
      host,
      title: "Layer Manager",
      notify: vi.fn(),
      debugLifecycle: vi.fn(),
      onTabSwitched,
      onAsyncTabResolved: vi.fn(),
      onPersistedTabDetected: vi.fn(),
    })

    const resolveExistingContentRoot = () => null
    const onSetContentFailure = vi.fn<() => void>()

    const firstPrepare = manager.prepareMount({
      resolveExistingContentRoot,
      onSetContentFailure,
    })

    expect(firstPrepare.status).toBe("ready")
    expect(initialTab.open).toHaveBeenCalledTimes(1)
    expect(onTabSwitched).toHaveBeenCalledTimes(1)

    manager.adoptPersistedTab(adoptedTab.tab)

    expect(host.sidepanelTab?.open).toBe(adoptedTab.open)
    expect(onTabSwitched).toHaveBeenCalledTimes(2)

    const secondPrepare = manager.prepareMount({
      resolveExistingContentRoot,
      onSetContentFailure,
    })

    expect(secondPrepare.status).toBe("ready")
    expect(adoptedTab.open).toHaveBeenCalledTimes(1)
  })

  it("adopts a persisted tab and clears mount state on resetAfterClose", () => {
    const fakeDocument = new FakeDocument()
    const sidepanelTab = makeSidepanelTabForMountMode(fakeDocument, null, "contentEl")

    const host: {
      sidepanelTab: typeof sidepanelTab.tab | null
      closeSidepanelTab: ReturnType<typeof vi.fn>
    } = {
      sidepanelTab: null,
      closeSidepanelTab: vi.fn(),
    }

    const manager = new SidepanelMountManager({
      host,
      title: "Layer Manager",
      notify: vi.fn(),
      debugLifecycle: vi.fn(),
      onTabSwitched: vi.fn(),
      onAsyncTabResolved: vi.fn(),
      onPersistedTabDetected: vi.fn(),
    })

    manager.adoptPersistedTab(sidepanelTab.tab)

    expect(host.sidepanelTab).toBe(sidepanelTab.tab)
    expect(manager.mountCapabilities).toEqual({
      canUseContentEl: true,
      canUseSetContent: false,
      canClose: true,
    })

    manager.resetAfterClose()

    expect(host.sidepanelTab).toBeNull()
    expect(manager.mountCapabilities).toBeNull()
  })

  it("preserves host-owned sidepanel siblings while attaching the Layer Manager root", () => {
    const fakeDocument = new FakeDocument()
    const preservedSibling = fakeDocument.createElement("div")
    preservedSibling.textContent = "keep me"

    const sidepanelTab = makeSidepanelTabForMountMode(fakeDocument, null, "contentEl")
    sidepanelTab.contentEl.appendChild(preservedSibling)

    const manager = new SidepanelMountManager({
      host: {
        sidepanelTab: sidepanelTab.tab,
      },
      title: "Layer Manager",
      notify: vi.fn(),
      debugLifecycle: vi.fn(),
      onTabSwitched: vi.fn(),
      onAsyncTabResolved: vi.fn(),
      onPersistedTabDetected: vi.fn(),
    })

    const preparation = manager.prepareMount({
      resolveExistingContentRoot: () => null,
      onSetContentFailure: vi.fn(),
    })

    expect(preparation.status).toBe("ready")
    if (preparation.status !== "ready") {
      throw new Error("expected ready mount preparation")
    }

    const contentRoot = fakeDocument.createElement("section")
    const attachOutcome = preparation.mountStrategy.attach(contentRoot as unknown as HTMLElement)

    expect(attachOutcome).toEqual({ ok: true })
    expect(sidepanelTab.contentEl.contains(preservedSibling)).toBe(true)
    expect(sidepanelTab.contentEl.contains(contentRoot)).toBe(true)
  })
})
