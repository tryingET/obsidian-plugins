import { describe, expect, it, vi } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import type { LayerManagerUiActions } from "../src/ui/renderer.js"
import { SidepanelSelectionActionController } from "../src/ui/sidepanel/actions/selectionActionController.js"
import { SidepanelPromptInteractionService } from "../src/ui/sidepanel/prompt/promptInteractionService.js"
import { makePresetKey, makePresetLabel } from "../src/ui/sidepanel/quickmove/presetHelpers.js"

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

const makeElementNode = (elementId: string, frameId: string | null): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId,
  label: elementId,
})

const makeHarness = () => {
  const notify = vi.fn<(message: string) => void>()
  const setLastQuickMoveDestination = vi.fn<(destination: unknown) => void>()
  const suppressKeyboardAfterPrompt = vi.fn<() => void>()
  const setShouldAutofocusContentRoot = vi.fn<(value: boolean) => void>()
  const focusContentRoot = vi.fn<() => void>()

  const promptService = new SidepanelPromptInteractionService({
    getOwnerDocument: () => null,
    notify,
    suppressKeyboardAfterPrompt,
    setShouldAutofocusContentRoot,
    focusContentRoot,
  })

  const controller = new SidepanelSelectionActionController({
    notify,
    promptService,
    setLastQuickMoveDestination: (destination) => {
      setLastQuickMoveDestination(destination)
    },
  })

  const beginInteraction = vi.fn<() => void>()
  const endInteraction = vi.fn<() => void>()
  const createGroup = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
  const reorder = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))
  const reparent = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))

  const actions = {
    beginInteraction,
    endInteraction,
    commands: {
      createGroup,
      reorder,
      reparent,
    },
  } as unknown as LayerManagerUiActions

  return {
    controller,
    notify,
    setLastQuickMoveDestination,
    suppressKeyboardAfterPrompt,
    setShouldAutofocusContentRoot,
    focusContentRoot,
    actions,
    beginInteraction,
    endInteraction,
    createGroup,
    reorder,
    reparent,
  }
}

describe("sidepanel selection action controller", () => {
  it("fails closed for groupSelected with less than two selected elements", async () => {
    const harness = makeHarness()

    await harness.controller.groupSelected(harness.actions, ["el:A"])

    expect(harness.notify).toHaveBeenCalledWith(
      "Create group requires at least two selected elements.",
    )
    expect(harness.createGroup).not.toHaveBeenCalled()
  })

  it("groups selected elements with trimmed prompt name seed", async () => {
    const harness = makeHarness()

    await withPatchedGlobalPrompt(
      vi.fn(() => "  New Group  "),
      async () => {
        await harness.controller.groupSelected(harness.actions, ["el:A", "el:B"])
      },
    )

    expect(harness.createGroup).toHaveBeenCalledWith({
      elementIds: ["el:A", "el:B"],
      nameSeed: "New Group",
    })
    expect(harness.beginInteraction).toHaveBeenCalledTimes(1)
    expect(harness.endInteraction).toHaveBeenCalledTimes(1)
    expect(harness.suppressKeyboardAfterPrompt).toHaveBeenCalledTimes(1)
  })

  it("reparents selected elements via prompt sequence and stores preset destination", async () => {
    const harness = makeHarness()
    const promptQueue = ["Outer > Inner", "SourceGroup", "Frame-X"]

    await withPatchedGlobalPrompt(
      vi.fn(() => promptQueue.shift() ?? null),
      async () => {
        await harness.controller.reparentSelected(harness.actions, {
          elementIds: ["el:A"],
          nodes: [makeElementNode("el:A", "Frame-A")],
        })
      },
    )

    expect(harness.reparent).toHaveBeenCalledWith({
      elementIds: ["el:A"],
      sourceGroupId: "SourceGroup",
      targetParentPath: ["Outer", "Inner"],
      targetFrameId: "Frame-X",
    })

    expect(harness.setLastQuickMoveDestination).toHaveBeenCalledWith({
      kind: "preset",
      preset: {
        key: makePresetKey(["Outer", "Inner"], "Frame-X"),
        label: makePresetLabel(["Outer", "Inner"]),
        targetParentPath: ["Outer", "Inner"],
        targetFrameId: "Frame-X",
      },
    })

    expect(harness.beginInteraction).toHaveBeenCalledTimes(1)
    expect(harness.endInteraction).toHaveBeenCalledTimes(1)
  })

  it("fails closed for applyGroupPreset when selection frame is incompatible", async () => {
    const harness = makeHarness()

    await harness.controller.applyGroupPreset(
      harness.actions,
      {
        elementIds: ["el:A"],
        nodes: [makeElementNode("el:A", "Frame-A")],
      },
      {
        key: makePresetKey(["G"], "Frame-B"),
        label: "Inside G",
        targetParentPath: ["G"],
        targetFrameId: "Frame-B",
      },
    )

    expect(harness.notify).toHaveBeenCalledWith(
      "Preset move failed: selected elements are in a different frame.",
    )
    expect(harness.reparent).not.toHaveBeenCalled()
    expect(harness.setLastQuickMoveDestination).not.toHaveBeenCalled()
  })

  it("executes ungroupLikeSelection confirmation and routes to move-to-root", async () => {
    const harness = makeHarness()

    await withPatchedGlobalPrompt(
      vi.fn(() => "UNGROUP"),
      async () => {
        await harness.controller.ungroupLikeSelection(harness.actions, {
          elementIds: ["el:A"],
          nodes: [makeElementNode("el:A", "Frame-A")],
        })
      },
    )

    expect(harness.reparent).toHaveBeenCalledWith({
      elementIds: ["el:A"],
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: "Frame-A",
    })

    expect(harness.setLastQuickMoveDestination).toHaveBeenCalledWith({
      kind: "root",
    })
  })
})
