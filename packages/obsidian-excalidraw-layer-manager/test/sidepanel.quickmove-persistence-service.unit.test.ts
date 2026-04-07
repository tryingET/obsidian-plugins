import { describe, expect, it, vi } from "vitest"

import { makePresetKey, makePresetLabel } from "../src/ui/sidepanel/quickmove/presetHelpers.js"
import {
  type LastQuickMoveDestination,
  SidepanelQuickMovePersistenceService,
} from "../src/ui/sidepanel/quickmove/quickMovePersistenceService.js"
import {
  type ScriptSettingsLike,
  SidepanelSettingsWriteQueue,
} from "../src/ui/sidepanel/settings/settingsWriteQueue.js"

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

const createHarness = (initialSettings: ScriptSettingsLike = {}) => {
  let settings = structuredClone(initialSettings)

  const setScriptSettings = vi.fn((nextSettings: ScriptSettingsLike) => {
    settings = structuredClone(nextSettings)
  })

  const queue = new SidepanelSettingsWriteQueue({
    getScriptSettings: () => settings,
    setScriptSettings,
    notify: vi.fn(),
  })

  const service = new SidepanelQuickMovePersistenceService({
    getScriptSettings: () => settings,
    settingsWriteQueue: queue,
  })

  return {
    service,
    setScriptSettings,
    getSettings: () => settings,
  }
}

describe("sidepanel quick-move persistence service", () => {
  it("loads persisted preset destination once from settings", () => {
    const path = ["G", "Inner"]
    const harness = createHarness({
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "preset",
          targetParentPath: path,
          targetFrameId: null,
        },
      },
    })

    harness.service.loadFromSettingsOnce()

    expect(harness.service.persistLastMoveAcrossRestarts).toBe(true)
    expect(harness.service.lastQuickMoveDestination).toEqual({
      kind: "preset",
      preset: {
        key: makePresetKey(path, null),
        label: makePresetLabel(path),
        targetParentPath: path,
        targetFrameId: null,
      },
    })
  })

  it("ignores subsequent loads after first settings bootstrap", () => {
    const harness = createHarness({
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "root",
        },
      },
    })

    harness.service.loadFromSettingsOnce()
    expect(harness.service.lastQuickMoveDestination).toEqual({
      kind: "root",
    })

    const settings = harness.getSettings()
    settings["lmx_last_move_destination"] = {
      value: {
        kind: "preset",
        targetParentPath: ["Changed"],
        targetFrameId: null,
      },
    }

    harness.service.loadFromSettingsOnce()

    expect(harness.service.lastQuickMoveDestination).toEqual({
      kind: "root",
    })
  })

  it("persists root destination when preference is enabled", async () => {
    const harness = createHarness()

    harness.service.setPersistLastMoveAcrossRestarts(true)
    await flushAsync()

    harness.setScriptSettings.mockClear()

    harness.service.setLastQuickMoveDestination({
      kind: "root",
    })

    await flushAsync()

    expect(harness.setScriptSettings).toHaveBeenCalledTimes(1)
    const written = harness.setScriptSettings.mock.calls[0]?.[0] as ScriptSettingsLike

    expect(written["lmx_persist_last_move_destination"]?.value).toBe(true)
    expect((written["lmx_last_move_destination"]?.value as { readonly kind?: string })?.kind).toBe(
      "root",
    )
  })

  it("does not write destination updates while preference is disabled", async () => {
    const harness = createHarness()

    harness.setScriptSettings.mockClear()

    harness.service.setLastQuickMoveDestination({
      kind: "root",
    })

    await flushAsync()

    expect(harness.setScriptSettings).not.toHaveBeenCalled()
  })

  it("writes disabled preference with null persisted destination but keeps runtime destination", async () => {
    const harness = createHarness()

    const runtimeDestination: LastQuickMoveDestination = {
      kind: "preset",
      preset: {
        key: makePresetKey(["G"], null),
        label: "Inside G",
        targetParentPath: ["G"],
        targetFrameId: null,
      },
    }

    harness.service.setLastQuickMoveDestination(runtimeDestination)
    harness.service.setPersistLastMoveAcrossRestarts(true)
    await flushAsync()

    harness.setScriptSettings.mockClear()

    harness.service.setPersistLastMoveAcrossRestarts(false)
    await flushAsync()

    const written = harness.setScriptSettings.mock.calls.at(-1)?.[0] as ScriptSettingsLike
    expect(written["lmx_persist_last_move_destination"]?.value).toBe(false)
    expect(written["lmx_last_move_destination"]?.value).toBeNull()
    expect(harness.service.lastQuickMoveDestination).toEqual(runtimeDestination)
  })
})
