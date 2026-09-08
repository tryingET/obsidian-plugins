import { describe, expect, it, vi } from "vitest"

import { SidepanelFocusOutGuard } from "../src/ui/sidepanel/focus/focusOutGuard.js"
import { FakeDocument } from "./sidepanelTestHarness.js"

const setup = () => {
  const document = new FakeDocument()
  const contentRoot = document.createElement("div") as unknown as HTMLElement
  const onConfirmedFocusOut = vi.fn()
  const guard = new SidepanelFocusOutGuard({ nowMs: () => 1000 })
  return { guard, contentRoot, onConfirmedFocusOut, relatedTarget: null }
}

describe("focus-out race characterization", () => {
  it("rechecks suppression that begins after the confirmation was scheduled", async () => {
    const input = setup()
    input.guard.handleFocusOut(input)
    input.guard.suppressFor(100)
    await Promise.resolve()
    expect(input.onConfirmedFocusOut).not.toHaveBeenCalled()
    expect(input.guard.isSuppressed()).toBe(true)
  })

  it("does not confirm a root that became noncurrent before the microtask", async () => {
    const input = setup()
    let current = true
    const isContentRootCurrent = vi.fn(() => current)
    input.guard.handleFocusOut({ ...input, isContentRootCurrent })
    current = false
    await Promise.resolve()
    expect(isContentRootCurrent).toHaveBeenCalledWith(input.contentRoot)
    expect(input.onConfirmedFocusOut).not.toHaveBeenCalled()
  })

  it.each([0, -10])(
    "ignores nonpositive suppression duration %s without clearing an existing window",
    (duration) => {
      const { guard } = setup()
      guard.suppressFor(duration)
      expect(guard.isSuppressed()).toBe(false)
      guard.suppressFor(100)
      guard.suppressFor(duration)
      expect(guard.isSuppressed()).toBe(true)
    },
  )

  it("ignores a missing root without cancelling a pending valid confirmation", async () => {
    const input = setup()
    const missingRootConfirmation = vi.fn()
    input.guard.handleFocusOut(input)
    input.guard.handleFocusOut({
      contentRoot: null,
      relatedTarget: null,
      onConfirmedFocusOut: missingRootConfirmation,
    })
    await Promise.resolve()
    expect(input.onConfirmedFocusOut).toHaveBeenCalledTimes(1)
    expect(missingRootConfirmation).not.toHaveBeenCalled()
  })

  it("treats a host contains failure as outside rather than losing focus confirmation", async () => {
    const input = setup()
    const contains = vi.spyOn(input.contentRoot, "contains").mockImplementation(() => {
      throw new Error("foreign document")
    })
    input.guard.handleFocusOut({
      ...input,
      relatedTarget: { nodeType: 1 } as unknown as EventTarget,
    })
    await Promise.resolve()
    expect(contains).toHaveBeenCalledTimes(1)
    expect(input.onConfirmedFocusOut).toHaveBeenCalledTimes(1)
  })
})
