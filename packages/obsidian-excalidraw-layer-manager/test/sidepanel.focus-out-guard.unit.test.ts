import { describe, expect, it, vi } from "vitest"

import { SidepanelFocusOutGuard } from "../src/ui/sidepanel/focus/focusOutGuard.js"

interface FocusHarness {
  readonly contentRoot: HTMLElement
  readonly insideTarget: EventTarget
  readonly outsideTarget: EventTarget
  setActiveElement: (target: EventTarget | null) => void
}

const makeEventTarget = (): EventTarget => {
  return {
    nodeType: 1,
  } as unknown as EventTarget
}

const makeFocusHarness = (): FocusHarness => {
  const insideTarget = makeEventTarget()
  const outsideTarget = makeEventTarget()

  const ownerDocument = {
    activeElement: null as EventTarget | null,
  }

  const contentRoot = {
    ownerDocument,
    contains: (candidate: EventTarget | null) => candidate === insideTarget,
  } as unknown as HTMLElement

  return {
    contentRoot,
    insideTarget,
    outsideTarget,
    setActiveElement: (target) => {
      ownerDocument.activeElement = target
    },
  }
}

const flushMicrotask = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("sidepanel focus out guard", () => {
  it("suppresses focusout while suppression window is active", async () => {
    let now = 1_000
    const guard = new SidepanelFocusOutGuard({
      nowMs: () => now,
    })

    const harness = makeFocusHarness()
    const onConfirmedFocusOut = vi.fn<() => void>()

    guard.suppressFor(180)

    guard.handleFocusOut({
      contentRoot: harness.contentRoot,
      relatedTarget: harness.outsideTarget,
      onConfirmedFocusOut,
    })

    await flushMicrotask()
    expect(onConfirmedFocusOut).not.toHaveBeenCalled()

    now = 1_300

    guard.handleFocusOut({
      contentRoot: harness.contentRoot,
      relatedTarget: harness.outsideTarget,
      onConfirmedFocusOut,
    })

    await flushMicrotask()
    expect(onConfirmedFocusOut).toHaveBeenCalledTimes(1)
  })

  it("ignores focusout when related target stays inside content root", async () => {
    const guard = new SidepanelFocusOutGuard()
    const harness = makeFocusHarness()
    const onConfirmedFocusOut = vi.fn<() => void>()

    guard.handleFocusOut({
      contentRoot: harness.contentRoot,
      relatedTarget: harness.insideTarget,
      onConfirmedFocusOut,
    })

    await flushMicrotask()
    expect(onConfirmedFocusOut).not.toHaveBeenCalled()
  })

  it("ignores transient blur when active element returns to content root before microtask settles", async () => {
    const guard = new SidepanelFocusOutGuard()
    const harness = makeFocusHarness()
    const onConfirmedFocusOut = vi.fn<() => void>()

    guard.handleFocusOut({
      contentRoot: harness.contentRoot,
      relatedTarget: harness.outsideTarget,
      onConfirmedFocusOut,
    })

    harness.setActiveElement(harness.insideTarget)

    await flushMicrotask()
    expect(onConfirmedFocusOut).not.toHaveBeenCalled()
  })

  it("confirms focusout when target stays outside and root is still current", async () => {
    const guard = new SidepanelFocusOutGuard()
    const harness = makeFocusHarness()
    const onConfirmedFocusOut = vi.fn<() => void>()

    guard.handleFocusOut({
      contentRoot: harness.contentRoot,
      relatedTarget: harness.outsideTarget,
      isContentRootCurrent: () => true,
      onConfirmedFocusOut,
    })

    await flushMicrotask()
    expect(onConfirmedFocusOut).toHaveBeenCalledTimes(1)
  })

  it("cancels pending focusout confirmation when a newer interaction arrives", async () => {
    const guard = new SidepanelFocusOutGuard()
    const harness = makeFocusHarness()
    const onConfirmedFocusOut = vi.fn<() => void>()

    guard.handleFocusOut({
      contentRoot: harness.contentRoot,
      relatedTarget: harness.outsideTarget,
      onConfirmedFocusOut,
    })

    guard.cancelPending()

    await flushMicrotask()
    expect(onConfirmedFocusOut).not.toHaveBeenCalled()
  })
})
