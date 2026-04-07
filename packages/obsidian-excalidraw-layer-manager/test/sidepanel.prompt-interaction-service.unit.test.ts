import { describe, expect, it, vi } from "vitest"

import type { LayerManagerUiActions } from "../src/ui/renderer.js"
import { SidepanelPromptInteractionService } from "../src/ui/sidepanel/prompt/promptInteractionService.js"

const withPatchedGlobalPrompt = async (
  promptValue: unknown,
  run: () => void | Promise<void>,
): Promise<void> => {
  const runtime = globalThis as Record<string, unknown>
  const hadPrompt = "prompt" in runtime
  const previousPrompt = runtime["prompt"]
  runtime["prompt"] = promptValue

  try {
    await run()
  } finally {
    if (hadPrompt) {
      runtime["prompt"] = previousPrompt
    } else {
      runtime["prompt"] = undefined
    }
  }
}

const makeActions = () => {
  const beginInteraction = vi.fn<() => void>()
  const endInteraction = vi.fn<() => void>()

  const actions = {
    beginInteraction,
    endInteraction,
  } as unknown as LayerManagerUiActions

  return {
    actions,
    beginInteraction,
    endInteraction,
  }
}

const makeHostHarness = (ownerDocument: Document | null = null) => {
  const notify = vi.fn<(message: string) => void>()
  const suppressKeyboardAfterPrompt = vi.fn<() => void>()
  const setShouldAutofocusContentRoot = vi.fn<(value: boolean) => void>()
  const focusContentRoot = vi.fn<() => void>()

  const service = new SidepanelPromptInteractionService({
    getOwnerDocument: () => ownerDocument,
    notify,
    suppressKeyboardAfterPrompt,
    setShouldAutofocusContentRoot,
    focusContentRoot,
  })

  return {
    service,
    notify,
    suppressKeyboardAfterPrompt,
    setShouldAutofocusContentRoot,
    focusContentRoot,
  }
}

describe("sidepanel prompt interaction service", () => {
  it("returns unavailable when no prompt source is present", async () => {
    await withPatchedGlobalPrompt(undefined, async () => {
      const harness = makeHostHarness(null)

      expect(harness.service.promptRaw("message", "seed")).toEqual({
        available: false,
      })
    })
  })

  it("coerces non-string prompt values to strings", async () => {
    const ownerDocument = {
      defaultView: {
        prompt: vi.fn(() => 42),
      },
    } as unknown as Document

    await withPatchedGlobalPrompt(undefined, async () => {
      const harness = makeHostHarness(ownerDocument)

      expect(harness.service.promptRaw("message", "seed")).toEqual({
        available: true,
        value: "42",
      })
    })
  })

  it("wraps prompt flow with interaction lifecycle and unsupported-message notification", async () => {
    await withPatchedGlobalPrompt(undefined, async () => {
      const harness = makeHostHarness(null)
      const { actions, beginInteraction, endInteraction } = makeActions()

      const result = harness.service.promptWithInteraction(
        actions,
        "Question",
        "",
        "Prompt unavailable",
      )

      expect(result).toEqual({
        cancelled: true,
      })
      expect(harness.notify).toHaveBeenCalledWith("Prompt unavailable")
      expect(beginInteraction).toHaveBeenCalledTimes(1)
      expect(endInteraction).toHaveBeenCalledTimes(1)
      expect(harness.suppressKeyboardAfterPrompt).toHaveBeenCalledTimes(1)
      expect(harness.setShouldAutofocusContentRoot).toHaveBeenCalledWith(true)
      expect(harness.focusContentRoot).toHaveBeenCalledTimes(1)
    })
  })

  it("returns prompt value and still restores focus/interactions", async () => {
    const ownerDocument = {
      defaultView: {
        prompt: vi.fn(() => "Renamed"),
      },
    } as unknown as Document

    await withPatchedGlobalPrompt(undefined, async () => {
      const harness = makeHostHarness(ownerDocument)
      const { actions, beginInteraction, endInteraction } = makeActions()

      const result = harness.service.promptWithInteraction(actions, "Question", "", "unsupported")

      expect(result).toEqual({
        cancelled: false,
        value: "Renamed",
      })
      expect(harness.notify).not.toHaveBeenCalled()
      expect(beginInteraction).toHaveBeenCalledTimes(1)
      expect(endInteraction).toHaveBeenCalledTimes(1)
      expect(harness.suppressKeyboardAfterPrompt).toHaveBeenCalledTimes(1)
      expect(harness.focusContentRoot).toHaveBeenCalledTimes(1)
    })
  })

  it("always executes interaction-finalizer when operation throws", () => {
    const harness = makeHostHarness(null)
    const { actions, beginInteraction, endInteraction } = makeActions()

    expect(() =>
      harness.service.withInteractionWindow(actions, () => {
        throw new Error("boom")
      }),
    ).toThrow("boom")

    expect(beginInteraction).toHaveBeenCalledTimes(1)
    expect(endInteraction).toHaveBeenCalledTimes(1)
    expect(harness.suppressKeyboardAfterPrompt).toHaveBeenCalledTimes(1)
    expect(harness.setShouldAutofocusContentRoot).toHaveBeenCalledWith(true)
    expect(harness.focusContentRoot).toHaveBeenCalledTimes(1)
  })
})
