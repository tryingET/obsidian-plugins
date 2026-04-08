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
    expect(harness.service.recentQuickMoveDestinations).toEqual([
      {
        kind: "preset",
        preset: {
          key: makePresetKey(path, null),
          label: makePresetLabel(path),
          targetParentPath: path,
          targetFrameId: null,
        },
      },
    ])
  })

  it("ignores malformed persisted preset payloads that sanitize to an empty path", () => {
    const harness = createHarness({
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "preset",
          targetParentPath: ["   ", ""],
          targetFrameId: null,
        },
      },
    })

    harness.service.loadFromSettingsOnce()

    expect(harness.service.persistLastMoveAcrossRestarts).toBe(true)
    expect(harness.service.lastQuickMoveDestination).toBeNull()
    expect(harness.service.recentQuickMoveDestinations).toEqual([])
  })

  it("fails closed when persisted preset payload would need path sanitization", () => {
    const harness = createHarness({
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "preset",
          targetParentPath: [" ", "Finance"],
          targetFrameId: null,
        },
      },
    })

    harness.service.loadFromSettingsOnce()

    expect(harness.service.persistLastMoveAcrossRestarts).toBe(true)
    expect(harness.service.lastQuickMoveDestination).toBeNull()
    expect(harness.service.recentQuickMoveDestinations).toEqual([])
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
      targetFrameId: null,
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
      targetFrameId: null,
    })
  })

  it("tracks recent destinations with latest-first dedupe", () => {
    const harness = createHarness()

    const firstPreset: LastQuickMoveDestination = {
      kind: "preset",
      preset: {
        key: makePresetKey(["G1"], null),
        label: "Inside G1",
        targetParentPath: ["G1"],
        targetFrameId: null,
      },
    }

    const secondPreset: LastQuickMoveDestination = {
      kind: "preset",
      preset: {
        key: makePresetKey(["G2"], null),
        label: "Inside G2",
        targetParentPath: ["G2"],
        targetFrameId: null,
      },
    }

    harness.service.setLastQuickMoveDestination({ kind: "root", targetFrameId: null })
    harness.service.setLastQuickMoveDestination(firstPreset)
    harness.service.setLastQuickMoveDestination(secondPreset)
    harness.service.setLastQuickMoveDestination(firstPreset)

    expect(harness.service.recentQuickMoveDestinations).toEqual([
      firstPreset,
      secondPreset,
      { kind: "root", targetFrameId: null },
    ])
  })

  it("keeps frame-root destinations distinct from canvas root in recent history", () => {
    const harness = createHarness()

    harness.service.setLastQuickMoveDestination({ kind: "root", targetFrameId: null })
    harness.service.setLastQuickMoveDestination({ kind: "root", targetFrameId: "Frame-A" })

    expect(harness.service.recentQuickMoveDestinations).toEqual([
      { kind: "root", targetFrameId: "Frame-A" },
      { kind: "root", targetFrameId: null },
    ])
  })

  it("persists root destination when preference is enabled", async () => {
    const harness = createHarness()

    harness.service.setPersistLastMoveAcrossRestarts(true)
    await flushAsync()

    harness.setScriptSettings.mockClear()

    harness.service.setLastQuickMoveDestination({
      kind: "root",
      targetFrameId: "Frame-A",
    })

    await flushAsync()

    expect(harness.setScriptSettings).toHaveBeenCalledTimes(1)
    const written = harness.setScriptSettings.mock.calls[0]?.[0] as ScriptSettingsLike

    expect(written["lmx_persist_last_move_destination"]?.value).toBe(true)
    expect(written["lmx_last_move_destination"]?.value).toEqual({
      kind: "root",
      targetFrameId: "Frame-A",
    })
  })

  it("does not write destination updates while preference is disabled", async () => {
    const harness = createHarness()

    harness.setScriptSettings.mockClear()

    harness.service.setLastQuickMoveDestination({
      kind: "root",
      targetFrameId: null,
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
