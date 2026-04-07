import { describe, expect, it, vi } from "vitest"

import { SidepanelFocusOwnershipCoordinator } from "../src/ui/sidepanel/focus/focusOwnershipCoordinator.js"

interface FocusHarness {
  readonly contentRoot: HTMLElement
  readonly insideTarget: EventTarget
  readonly outsideTarget: EventTarget
  readonly focus: ReturnType<typeof vi.fn>
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

  const focus = vi.fn<() => void>(() => {
    ownerDocument.activeElement = insideTarget
  })

  const contentRoot = {
    ownerDocument,
    focus,
    contains: (candidate: EventTarget | null) => candidate === insideTarget,
  } as unknown as HTMLElement

  return {
    contentRoot,
    insideTarget,
    outsideTarget,
    focus,
    setActiveElement: (target) => {
      ownerDocument.activeElement = target
    },
  }
}

const flushMicrotask = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("sidepanel focus ownership coordinator", () => {
  it("keeps keyboard routing sticky for a grace window after capture deactivates", () => {
    let now = 1_000

    const coordinator = new SidepanelFocusOwnershipCoordinator({
      nowMs: () => now,
      focusOutSuppressionWindowMs: 180,
      keyboardStickyCaptureMs: 400,
    })

    expect(coordinator.isKeyboardRoutingActive()).toBe(false)

    coordinator.activateKeyboardCapture()
    expect(coordinator.isKeyboardCaptureActive()).toBe(true)
    expect(coordinator.isKeyboardRoutingActive()).toBe(true)

    coordinator.releaseKeyboardCapture()
    expect(coordinator.isKeyboardCaptureActive()).toBe(false)

    now = 1_250
    expect(coordinator.isKeyboardRoutingActive()).toBe(true)

    now = 1_450
    expect(coordinator.isKeyboardRoutingActive()).toBe(false)
  })

  it("suppresses transient focusout and confirms blur once suppression expires", async () => {
    let now = 5_000

    const coordinator = new SidepanelFocusOwnershipCoordinator({
      nowMs: () => now,
      focusOutSuppressionWindowMs: 220,
      keyboardStickyCaptureMs: 400,
    })

    const harness = makeFocusHarness()
    const onConfirmedFocusOut = vi.fn<() => void>()

    coordinator.suppressTransientFocusOut()

    coordinator.handleContentFocusOut({
      contentRoot: harness.contentRoot,
      relatedTarget: harness.outsideTarget,
      onConfirmedFocusOut,
    })

    await flushMicrotask()
    expect(onConfirmedFocusOut).not.toHaveBeenCalled()

    now = 5_300
    coordinator.handleContentFocusOut({
      contentRoot: harness.contentRoot,
      relatedTarget: harness.outsideTarget,
      onConfirmedFocusOut,
    })

    await flushMicrotask()
    expect(onConfirmedFocusOut).toHaveBeenCalledTimes(1)
  })

  it("cancels deferred best-effort refocus when rename flow invalidates previous epoch", async () => {
    const harness = makeFocusHarness()

    const coordinator = new SidepanelFocusOwnershipCoordinator({
      focusOutSuppressionWindowMs: 180,
      keyboardStickyCaptureMs: 400,
    })

    coordinator.focusContentRootBestEffort({
      contentRoot: harness.contentRoot,
    })

    expect(harness.focus).toHaveBeenCalledTimes(1)

    coordinator.cancelDeferredFocusRestore()
    await flushMicrotask()

    expect(harness.focus).toHaveBeenCalledTimes(1)
  })

  it("autofocuses content root once and claims keyboard ownership", () => {
    const harness = makeFocusHarness()

    const coordinator = new SidepanelFocusOwnershipCoordinator({
      focusOutSuppressionWindowMs: 180,
      keyboardStickyCaptureMs: 400,
    })

    harness.setActiveElement(null)
    coordinator.autofocusContentRootIfNeeded(harness.contentRoot, () => false)

    expect(harness.focus).toHaveBeenCalledTimes(1)
    expect(coordinator.shouldAutofocusContentRoot).toBe(false)
    expect(coordinator.isKeyboardCaptureActive()).toBe(true)

    coordinator.autofocusContentRootIfNeeded(harness.contentRoot, () => false)
    expect(harness.focus).toHaveBeenCalledTimes(1)
  })

  it("restores default ownership state on reset", () => {
    const coordinator = new SidepanelFocusOwnershipCoordinator({
      focusOutSuppressionWindowMs: 180,
      keyboardStickyCaptureMs: 400,
    })

    coordinator.activateKeyboardCapture()
    coordinator.setShouldAutofocusContentRoot(false)
    coordinator.suppressTransientFocusOut()
    coordinator.reset()

    expect(coordinator.isKeyboardCaptureActive()).toBe(false)
    expect(coordinator.shouldAutofocusContentRoot).toBe(true)
    expect(coordinator.isFocusOutSuppressed()).toBe(false)
  })
})
