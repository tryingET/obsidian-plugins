import { describe, expect, it, vi } from "vitest"

import {
  type ScriptSettingsLike,
  SidepanelSettingsWriteQueue,
} from "../src/ui/sidepanel/settings/settingsWriteQueue.js"

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("sidepanel settings write queue", () => {
  it("writes mutated settings using a cloned snapshot", async () => {
    let settings: ScriptSettingsLike = {
      existing: {
        value: "kept",
        description: "keep",
      },
    }

    const setScriptSettings = vi.fn((nextSettings: ScriptSettingsLike) => {
      settings = structuredClone(nextSettings)
    })

    const queue = new SidepanelSettingsWriteQueue({
      getScriptSettings: () => settings,
      setScriptSettings,
      notify: vi.fn(),
    })

    queue.enqueue((nextSettings) => {
      nextSettings["added"] = {
        value: 123,
      }
    }, "write failed")

    await flushAsync()

    expect(setScriptSettings).toHaveBeenCalledTimes(1)
    const written = setScriptSettings.mock.calls[0]?.[0] as ScriptSettingsLike
    expect(written["existing"]?.value).toBe("kept")
    expect(written["existing"]?.description).toBe("keep")
    expect(written["added"]?.value).toBe(123)
  })

  it("is inert when required host APIs are missing", async () => {
    const notify = vi.fn<(message: string) => void>()

    const queueMissingGetter = new SidepanelSettingsWriteQueue({
      setScriptSettings: vi.fn(),
      notify,
    })

    const queueMissingSetter = new SidepanelSettingsWriteQueue({
      getScriptSettings: () => ({}),
      notify,
    })

    queueMissingGetter.enqueue(() => {}, "missing getter")
    queueMissingSetter.enqueue(() => {}, "missing setter")

    await flushAsync()

    expect(notify).not.toHaveBeenCalled()
  })

  it("serializes rapid writes while async setScriptSettings calls are in-flight", async () => {
    let settings: ScriptSettingsLike = {
      flag: { value: false },
    }

    const pendingResolvers: Array<() => void> = []
    const setScriptSettings = vi.fn((nextSettings: ScriptSettingsLike) => {
      return new Promise<void>((resolve) => {
        pendingResolvers.push(() => {
          settings = structuredClone(nextSettings)
          resolve()
        })
      })
    })

    const queue = new SidepanelSettingsWriteQueue({
      getScriptSettings: () => settings,
      setScriptSettings,
      notify: vi.fn(),
    })

    queue.enqueue((nextSettings) => {
      nextSettings["flag"] = { value: true }
    }, "write-1 failed")

    queue.enqueue((nextSettings) => {
      nextSettings["flag"] = { value: false }
    }, "write-2 failed")

    expect(setScriptSettings).toHaveBeenCalledTimes(1)

    pendingResolvers.shift()?.()
    await flushAsync()

    expect(setScriptSettings).toHaveBeenCalledTimes(2)

    pendingResolvers.shift()?.()
    await flushAsync()

    expect(settings["flag"]?.value).toBe(false)
  })

  it("reports the batch error message on failed writes", async () => {
    const notify = vi.fn<(message: string) => void>()

    const queue = new SidepanelSettingsWriteQueue({
      getScriptSettings: () => ({
        baseline: { value: 1 },
      }),
      setScriptSettings: vi.fn(() => {
        throw new Error("boom")
      }),
      notify,
    })

    queue.enqueue(() => {}, "custom write failure")

    await flushAsync()

    expect(notify).toHaveBeenCalledWith("custom write failure")
  })
})
