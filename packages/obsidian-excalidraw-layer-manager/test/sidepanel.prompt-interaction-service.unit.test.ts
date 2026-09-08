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
  it("rejects an interaction after disposal without running its operation or lifecycle", () => {
    const harness = makeHostHarness()
    const { actions, beginInteraction, endInteraction } = makeActions()
    const operation = vi.fn(() => "must not run")
    harness.service.dispose()

    expect(() => harness.service.withInteractionWindow(actions, operation)).toThrow(
      "Prompt interaction actor did not settle synchronously.",
    )
    expect(operation).not.toHaveBeenCalled()
    expect(beginInteraction).not.toHaveBeenCalled()
    expect(endInteraction).not.toHaveBeenCalled()
    expect(harness.notify).not.toHaveBeenCalled()
    expect(harness.suppressKeyboardAfterPrompt).not.toHaveBeenCalled()
    expect(harness.setShouldAutofocusContentRoot).not.toHaveBeenCalled()
    expect(harness.focusContentRoot).not.toHaveBeenCalled()
  })

  it("accepts a synchronously settled undefined result and finalizes once", () => {
    const harness = makeHostHarness()
    const { actions, beginInteraction, endInteraction } = makeActions()
    const operation = vi.fn(() => undefined)
    try {
      expect(harness.service.withInteractionWindow(actions, operation)).toBeUndefined()
      expect(operation).toHaveBeenCalledTimes(1)
      expect(beginInteraction).toHaveBeenCalledTimes(1)
      expect(endInteraction).toHaveBeenCalledTimes(1)
      expect(harness.suppressKeyboardAfterPrompt).toHaveBeenCalledTimes(1)
      expect(harness.setShouldAutofocusContentRoot).toHaveBeenCalledWith(true)
      expect(harness.focusContentRoot).toHaveBeenCalledTimes(1)
    } finally {
      harness.service.dispose()
    }
  })

  it("rejects a prompt after disposal without opening it or running lifecycle callbacks", async () => {
    const prompt = vi.fn(() => "must not run")
    await withPatchedGlobalPrompt(prompt, () => {
      const harness = makeHostHarness()
      const { actions, beginInteraction, endInteraction } = makeActions()
      harness.service.dispose()

      expect(() =>
        harness.service.promptWithInteraction(actions, "Question", "seed", "unsupported"),
      ).toThrow("Prompt interaction actor did not produce a prompt result.")
      expect(prompt).not.toHaveBeenCalled()
      expect(beginInteraction).not.toHaveBeenCalled()
      expect(endInteraction).not.toHaveBeenCalled()
      expect(harness.notify).not.toHaveBeenCalled()
      expect(harness.suppressKeyboardAfterPrompt).not.toHaveBeenCalled()
      expect(harness.setShouldAutofocusContentRoot).not.toHaveBeenCalled()
      expect(harness.focusContentRoot).not.toHaveBeenCalled()
    })
  })

  it.each([null, ""])("preserves a prompt response of %j as a valid result", async (response) => {
    const prompt = vi.fn(() => response)
    await withPatchedGlobalPrompt(prompt, () => {
      const harness = makeHostHarness()
      const { actions, beginInteraction, endInteraction } = makeActions()
      try {
        expect(
          harness.service.promptWithInteraction(actions, "Question", "seed", "unsupported"),
        ).toEqual(response === null ? { cancelled: true } : { cancelled: false, value: "" })
        expect(prompt).toHaveBeenCalledWith("Question", "seed")
        expect(beginInteraction).toHaveBeenCalledTimes(1)
        expect(endInteraction).toHaveBeenCalledTimes(1)
        expect(harness.notify).not.toHaveBeenCalled()
        expect(harness.focusContentRoot).toHaveBeenCalledTimes(1)
      } finally {
        harness.service.dispose()
      }
    })
  })

  it.each(["begin", "end"])(
    "preserves the original prompt lifecycle error from %s",
    async (phase) => {
      await withPatchedGlobalPrompt(
        () => "value",
        () => {
          const harness = makeHostHarness()
          const { actions, beginInteraction, endInteraction } = makeActions()
          const failure = new Error(`${phase} failed`)
          const callback = phase === "begin" ? beginInteraction : endInteraction
          callback.mockImplementationOnce(() => {
            throw failure
          })
          let caught: unknown
          try {
            harness.service.promptWithInteraction(actions, "Question", "seed", "unsupported")
          } catch (error) {
            caught = error
          } finally {
            harness.service.dispose()
          }
          expect(caught).toBe(failure)
        },
      )
    },
  )

  it("reports reentrant non-settlement while preserving later queued operation execution", () => {
    const harness = makeHostHarness()
    const { actions, beginInteraction, endInteraction } = makeActions()
    const events: string[] = []
    beginInteraction.mockImplementation(() => {
      events.push("begin")
    })
    endInteraction.mockImplementation(() => {
      events.push("end")
    })
    const nested = vi.fn(() => {
      events.push("nested")
      return "nested result"
    })
    try {
      expect(
        harness.service.withInteractionWindow(actions, () => {
          expect(() => harness.service.withInteractionWindow(actions, nested)).toThrow(
            "Prompt interaction actor did not settle synchronously.",
          )
          expect(nested).not.toHaveBeenCalled()
          events.push("caught")
          return "outer result"
        }),
      ).toBe("outer result")
      expect(nested).toHaveBeenCalledTimes(1)
      expect(events).toEqual(["begin", "caught", "end", "begin", "nested", "end"])
      expect(harness.focusContentRoot).toHaveBeenCalledTimes(2)
    } finally {
      harness.service.dispose()
    }
  })

  it("reports a reentrant missing prompt result without cancelling the queued prompt", async () => {
    const events: string[] = []
    const prompt = vi.fn(() => {
      events.push("prompt")
      return "queued result"
    })
    await withPatchedGlobalPrompt(prompt, () => {
      const harness = makeHostHarness()
      const { actions, beginInteraction, endInteraction } = makeActions()
      beginInteraction.mockImplementation(() => {
        events.push("begin")
      })
      endInteraction.mockImplementation(() => {
        events.push("end")
      })
      try {
        expect(
          harness.service.withInteractionWindow(actions, () => {
            expect(() =>
              harness.service.promptWithInteraction(actions, "Question", "seed", "unsupported"),
            ).toThrow("Prompt interaction actor did not produce a prompt result.")
            expect(prompt).not.toHaveBeenCalled()
            events.push("caught")
            return "outer result"
          }),
        ).toBe("outer result")
        expect(prompt).toHaveBeenCalledTimes(1)
        expect(events).toEqual(["begin", "caught", "end", "begin", "prompt", "end"])
        expect(harness.focusContentRoot).toHaveBeenCalledTimes(2)
      } finally {
        harness.service.dispose()
      }
    })
  })

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

  it("runs promptless interactions without consulting host prompt sources", async () => {
    const promptSpy = vi.fn(() => {
      throw new Error("prompt should not be called")
    })

    await withPatchedGlobalPrompt(promptSpy, async () => {
      const harness = makeHostHarness(null)
      const { actions, beginInteraction, endInteraction } = makeActions()

      const result = harness.service.withPromptlessInteraction(actions, () => "ok")

      expect(result).toBe("ok")
      expect(promptSpy).not.toHaveBeenCalled()
      expect(harness.notify).not.toHaveBeenCalled()
      expect(beginInteraction).toHaveBeenCalledTimes(1)
      expect(endInteraction).toHaveBeenCalledTimes(1)
      expect(harness.suppressKeyboardAfterPrompt).toHaveBeenCalledTimes(1)
      expect(harness.setShouldAutofocusContentRoot).toHaveBeenCalledWith(true)
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
