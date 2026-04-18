import { describe, expect, it, vi } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import {
  buildSidepanelQuickMoveDestinationProjection,
  projectQuickMoveDestination,
  projectQuickMoveDestinations,
} from "../src/ui/sidepanel/quickmove/destinationProjection.js"
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

interface DeferredSettingsWrite {
  readonly mutator: (settings: ScriptSettingsLike) => void
  readonly onErrorMessage: string
  readonly resolve: (result: boolean) => void
}

const createDeferredQueueHarness = (initialSettings: ScriptSettingsLike = {}) => {
  let settings = structuredClone(initialSettings)
  const pendingWrites: DeferredSettingsWrite[] = []

  const queue = {
    get canWrite(): boolean {
      return true
    },
    enqueue(
      mutator: (nextSettings: ScriptSettingsLike) => void,
      onErrorMessage: string,
    ): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        pendingWrites.push({
          mutator,
          onErrorMessage,
          resolve,
        })
      })
    },
  } as SidepanelSettingsWriteQueue

  const service = new SidepanelQuickMovePersistenceService({
    getScriptSettings: () => settings,
    settingsWriteQueue: queue,
  })

  return {
    service,
    pendingWrites,
    setSettings: (nextSettings: ScriptSettingsLike) => {
      settings = structuredClone(nextSettings)
    },
    getSettings: () => settings,
  }
}

const makeElementNode = (elementId: string): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId: null,
  label: elementId,
})

const makeGroupNode = (groupId: string, label = groupId): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: ["A"],
  primaryElementId: "A",
  children: [makeElementNode("A")],
  canExpand: true,
  isExpanded: true,
  groupId,
  frameId: null,
  label,
})

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

  it("tracks recent destinations with latest-first dedupe", async () => {
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

    await harness.service.setLastQuickMoveDestination({ kind: "root", targetFrameId: null })
    await harness.service.setLastQuickMoveDestination(firstPreset)
    await harness.service.setLastQuickMoveDestination(secondPreset)
    await harness.service.setLastQuickMoveDestination(firstPreset)

    expect(harness.service.recentQuickMoveDestinations).toEqual([
      firstPreset,
      secondPreset,
      { kind: "root", targetFrameId: null },
    ])
  })

  it("keeps frame-root destinations distinct from canvas root in recent history", async () => {
    const harness = createHarness()

    await harness.service.setLastQuickMoveDestination({ kind: "root", targetFrameId: null })
    await harness.service.setLastQuickMoveDestination({ kind: "root", targetFrameId: "Frame-A" })

    expect(harness.service.recentQuickMoveDestinations).toEqual([
      { kind: "root", targetFrameId: "Frame-A" },
      { kind: "root", targetFrameId: null },
    ])
  })

  it("previews unchanged remembered-destination rebounds without mutating runtime state", async () => {
    const harness = createHarness()

    await harness.service.setLastQuickMoveDestination({
      kind: "preset",
      preset: {
        key: makePresetKey(["G"], null),
        label: "Inside G",
        targetParentPath: ["G"],
        targetFrameId: null,
      },
    })

    const preview = harness.service.previewReboundRememberedDestinations({
      lastQuickMoveDestination: {
        kind: "preset",
        preset: {
          key: makePresetKey(["G"], null),
          label: "Inside G",
          targetParentPath: ["G"],
          targetFrameId: null,
        },
      },
      recentQuickMoveDestinations: [
        {
          kind: "preset",
          preset: {
            key: makePresetKey(["G"], null),
            label: "Inside G",
            targetParentPath: ["G"],
            targetFrameId: null,
          },
        },
      ],
    })

    expect(preview).toEqual({
      lastQuickMoveDestination: {
        kind: "preset",
        preset: {
          key: makePresetKey(["G"], null),
          label: "Inside G",
          targetParentPath: ["G"],
          targetFrameId: null,
        },
      },
      recentQuickMoveDestinations: [
        {
          kind: "preset",
          preset: {
            key: makePresetKey(["G"], null),
            label: "Inside G",
            targetParentPath: ["G"],
            targetFrameId: null,
          },
        },
      ],
      changed: false,
    })
    expect(harness.service.lastQuickMoveDestination).toEqual({
      kind: "preset",
      preset: {
        key: makePresetKey(["G"], null),
        label: "Inside G",
        targetParentPath: ["G"],
        targetFrameId: null,
      },
    })
  })

  it("rebinds remembered destinations onto live registry labels and drops stale recents", async () => {
    const harness = createHarness()

    await harness.service.setLastQuickMoveDestination({ kind: "root", targetFrameId: null })
    await harness.service.setLastQuickMoveDestination({
      kind: "preset",
      preset: {
        key: makePresetKey(["missing"], null),
        label: "Inside missing",
        targetParentPath: ["missing"],
        targetFrameId: null,
      },
    })
    await harness.service.setLastQuickMoveDestination({
      kind: "preset",
      preset: {
        key: makePresetKey(["G"], null),
        label: "Inside old label",
        targetParentPath: ["G"],
        targetFrameId: null,
      },
    })

    const projection = buildSidepanelQuickMoveDestinationProjection(
      [makeGroupNode("G", "Renamed Group")],
      24,
      64,
    )

    const outcome = await harness.service.rebindRememberedDestinations({
      lastQuickMoveDestination: projectQuickMoveDestination(
        harness.service.lastQuickMoveDestination,
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
      recentQuickMoveDestinations: projectQuickMoveDestinations(
        harness.service.recentQuickMoveDestinations,
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
    })

    expect(outcome).toEqual({
      status: "reconciled",
      persisted: true,
    })
    expect(harness.service.lastQuickMoveDestination).toEqual({
      kind: "preset",
      preset: {
        key: makePresetKey(["G"], null),
        label: "Inside Renamed Group",
        targetParentPath: ["G"],
        targetFrameId: null,
      },
    })
    expect(harness.service.recentQuickMoveDestinations).toEqual([
      {
        kind: "preset",
        preset: {
          key: makePresetKey(["G"], null),
          label: "Inside Renamed Group",
          targetParentPath: ["G"],
          targetFrameId: null,
        },
      },
      { kind: "root", targetFrameId: null },
    ])
  })

  it("persists root destination when preference is enabled", async () => {
    const harness = createHarness()

    harness.service.setPersistLastMoveAcrossRestarts(true)
    await flushAsync()

    harness.setScriptSettings.mockClear()

    await harness.service.setLastQuickMoveDestination({
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

    await harness.service.setLastQuickMoveDestination({
      kind: "root",
      targetFrameId: null,
    })

    await flushAsync()

    expect(harness.setScriptSettings).not.toHaveBeenCalled()
  })

  it("captures last-move destination payloads at enqueue time", async () => {
    const harness = createDeferredQueueHarness({
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: null,
      },
    })

    harness.service.loadFromSettingsOnce()

    const firstPersist = harness.service.setLastQuickMoveDestination({
      kind: "root",
      targetFrameId: null,
    })
    const firstWrite = harness.pendingWrites.shift()
    if (!firstWrite) {
      throw new Error("Expected first deferred settings write.")
    }

    const secondPersist = harness.service.setLastQuickMoveDestination({
      kind: "root",
      targetFrameId: "Frame-A",
    })
    const secondWrite = harness.pendingWrites.shift()
    if (!secondWrite) {
      throw new Error("Expected second deferred settings write.")
    }

    const firstSnapshot: ScriptSettingsLike = {}
    firstWrite.mutator(firstSnapshot)
    expect(firstSnapshot["lmx_last_move_destination"]?.value).toEqual({
      kind: "root",
      targetFrameId: null,
    })

    const secondSnapshot: ScriptSettingsLike = {}
    secondWrite.mutator(secondSnapshot)
    expect(secondSnapshot["lmx_last_move_destination"]?.value).toEqual({
      kind: "root",
      targetFrameId: "Frame-A",
    })

    firstWrite.resolve(true)
    secondWrite.resolve(true)
    await expect(firstPersist).resolves.toBe(true)
    await expect(secondPersist).resolves.toBe(true)
  })

  it("captures preference snapshots at enqueue time even when later writes change runtime state", async () => {
    const harness = createDeferredQueueHarness({
      lmx_persist_last_move_destination: {
        value: false,
      },
      lmx_last_move_destination: {
        value: null,
      },
    })

    harness.service.loadFromSettingsOnce()
    await harness.service.setLastQuickMoveDestination({
      kind: "root",
      targetFrameId: null,
    })

    const enablePersistence = harness.service.setPersistLastMoveAcrossRestarts(true)
    const enableWrite = harness.pendingWrites.shift()
    if (!enableWrite) {
      throw new Error("Expected deferred preference write.")
    }

    const moveAfterEnable = harness.service.setLastQuickMoveDestination({
      kind: "root",
      targetFrameId: "Frame-A",
    })
    const moveWrite = harness.pendingWrites.shift()
    if (!moveWrite) {
      throw new Error("Expected deferred destination write after enabling persistence.")
    }

    const enableSnapshot: ScriptSettingsLike = {}
    enableWrite.mutator(enableSnapshot)
    expect(enableSnapshot["lmx_persist_last_move_destination"]?.value).toBe(true)
    expect(enableSnapshot["lmx_last_move_destination"]?.value).toEqual({
      kind: "root",
      targetFrameId: null,
    })

    const moveSnapshot: ScriptSettingsLike = {}
    moveWrite.mutator(moveSnapshot)
    expect(moveSnapshot["lmx_last_move_destination"]?.value).toEqual({
      kind: "root",
      targetFrameId: "Frame-A",
    })

    enableWrite.resolve(true)
    moveWrite.resolve(true)
    await expect(enablePersistence).resolves.toBe(true)
    await expect(moveAfterEnable).resolves.toBe(true)
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

    await harness.service.setLastQuickMoveDestination(runtimeDestination)
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

  it("reverts runtime last-move destination when persisted write fails", async () => {
    const settings: ScriptSettingsLike = {
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "root",
          targetFrameId: null,
        },
      },
    }

    const notify = vi.fn<(message: string) => void>()
    const setScriptSettings = vi.fn(async () => {
      throw new Error("disk full")
    })

    const queue = new SidepanelSettingsWriteQueue({
      getScriptSettings: () => settings,
      setScriptSettings,
      notify,
    })

    const service = new SidepanelQuickMovePersistenceService({
      getScriptSettings: () => settings,
      settingsWriteQueue: queue,
    })

    service.loadFromSettingsOnce()

    const persisted = await service.setLastQuickMoveDestination({
      kind: "root",
      targetFrameId: "Frame-A",
    })

    expect(persisted).toBe(false)
    expect(service.lastQuickMoveDestination).toEqual({
      kind: "root",
      targetFrameId: null,
    })
    expect(service.recentQuickMoveDestinations).toEqual([{ kind: "root", targetFrameId: null }])
    expect(notify).toHaveBeenCalledWith("Failed to persist last move destination.")
  })

  it("reverts remembered-destination reconciliation when persistence fails", async () => {
    const settings: ScriptSettingsLike = {
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "preset",
          targetParentPath: ["G"],
          targetFrameId: null,
          label: "Inside old label",
        },
      },
    }

    const notify = vi.fn<(message: string) => void>()
    const setScriptSettings = vi.fn(async () => {
      throw new Error("disk full")
    })

    const queue = new SidepanelSettingsWriteQueue({
      getScriptSettings: () => settings,
      setScriptSettings,
      notify,
    })

    const service = new SidepanelQuickMovePersistenceService({
      getScriptSettings: () => settings,
      settingsWriteQueue: queue,
    })

    service.loadFromSettingsOnce()

    const projection = buildSidepanelQuickMoveDestinationProjection(
      [makeGroupNode("G", "Renamed Group")],
      24,
      64,
    )

    const reboundInput = {
      lastQuickMoveDestination: projectQuickMoveDestination(
        service.lastQuickMoveDestination,
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
      recentQuickMoveDestinations: projectQuickMoveDestinations(
        service.recentQuickMoveDestinations,
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
    }

    const outcome = await service.rebindRememberedDestinations(reboundInput)

    expect(outcome).toEqual({
      status: "reconciled",
      persisted: false,
      revertedTo: {
        lastQuickMoveDestination: {
          kind: "preset",
          preset: {
            key: makePresetKey(["G"], null),
            label: "Inside old label",
            targetParentPath: ["G"],
            targetFrameId: null,
          },
        },
        recentQuickMoveDestinations: [
          {
            kind: "preset",
            preset: {
              key: makePresetKey(["G"], null),
              label: "Inside old label",
              targetParentPath: ["G"],
              targetFrameId: null,
            },
          },
        ],
      },
    })
    expect(service.lastQuickMoveDestination).toEqual({
      kind: "preset",
      preset: {
        key: makePresetKey(["G"], null),
        label: "Inside old label",
        targetParentPath: ["G"],
        targetFrameId: null,
      },
    })
    expect(service.recentQuickMoveDestinations).toEqual([
      {
        kind: "preset",
        preset: {
          key: makePresetKey(["G"], null),
          label: "Inside old label",
          targetParentPath: ["G"],
          targetFrameId: null,
        },
      },
    ])
    expect(notify).toHaveBeenCalledWith("Failed to persist last move destination.")

    const suppressedPreview = service.previewReboundRememberedDestinations(reboundInput)
    expect(service.shouldSuppressRememberedDestinationRebind(suppressedPreview)).toBe(true)

    await expect(service.rebindRememberedDestinations(reboundInput)).resolves.toEqual({
      status: "suppressed",
    })
    expect(setScriptSettings).toHaveBeenCalledTimes(1)
  })

  it("clears remembered-destination suppression after a later successful persisted change", async () => {
    let settings: ScriptSettingsLike = {
      lmx_persist_last_move_destination: {
        value: true,
      },
      lmx_last_move_destination: {
        value: {
          kind: "preset",
          targetParentPath: ["G"],
          targetFrameId: null,
          label: "Inside old label",
        },
      },
    }

    const notify = vi.fn<(message: string) => void>()
    const setScriptSettings = vi.fn(async (nextSettings: ScriptSettingsLike) => {
      settings = structuredClone(nextSettings)
    })
    setScriptSettings.mockRejectedValueOnce(new Error("disk full"))

    const queue = new SidepanelSettingsWriteQueue({
      getScriptSettings: () => settings,
      setScriptSettings,
      notify,
    })

    const service = new SidepanelQuickMovePersistenceService({
      getScriptSettings: () => settings,
      settingsWriteQueue: queue,
    })

    service.loadFromSettingsOnce()

    const projection = buildSidepanelQuickMoveDestinationProjection(
      [makeGroupNode("G", "Renamed Group")],
      24,
      64,
    )

    const reboundInput = {
      lastQuickMoveDestination: projectQuickMoveDestination(
        service.lastQuickMoveDestination,
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
      recentQuickMoveDestinations: projectQuickMoveDestinations(
        service.recentQuickMoveDestinations,
        projection.destinationByKey,
        projection.liveFrameIds,
      ),
    }

    await expect(service.rebindRememberedDestinations(reboundInput)).resolves.toMatchObject({
      status: "reconciled",
      persisted: false,
    })

    const suppressedPreview = service.previewReboundRememberedDestinations(reboundInput)
    expect(service.shouldSuppressRememberedDestinationRebind(suppressedPreview)).toBe(true)

    await expect(
      service.setLastQuickMoveDestination({
        kind: "root",
        targetFrameId: null,
      }),
    ).resolves.toBe(true)

    expect(service.shouldSuppressRememberedDestinationRebind(suppressedPreview)).toBe(false)
  })
})
