import { describe, expect, it, vi } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import type { LayerManagerUiActions } from "../src/ui/renderer.js"
import { SidepanelSelectionActionController } from "../src/ui/sidepanel/actions/selectionActionController.js"
import { SidepanelPromptInteractionService } from "../src/ui/sidepanel/prompt/promptInteractionService.js"
import { makePresetKey } from "../src/ui/sidepanel/quickmove/presetHelpers.js"

const makeFrameResolution = (frameId: string | null) => ({
  ok: true as const,
  frameId,
})

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

const makeFrameNode = (frameId: string, childIds: readonly string[] = []): LayerNode => ({
  id: `frame:${frameId}`,
  type: "frame",
  elementIds: [frameId, ...childIds],
  primaryElementId: frameId,
  children: [],
  canExpand: childIds.length > 0,
  isExpanded: true,
  groupId: null,
  frameId: null,
  label: frameId,
})

const makeGroupNode = (
  groupId: string,
  elementIds: readonly string[],
  frameId: string | null,
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: [...elementIds],
  primaryElementId: elementIds[0] ?? `group:${groupId}`,
  children: [],
  canExpand: true,
  isExpanded: true,
  groupId,
  frameId,
  label: groupId,
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
  const reparentFromNodeIds = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))

  const actions = {
    beginInteraction,
    endInteraction,
    reparentFromNodeIds,
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
    reparentFromNodeIds,
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

  it("applies a preset move and stores the destination", async () => {
    const harness = makeHarness()

    await harness.controller.applyGroupPreset(
      harness.actions,
      {
        elementIds: ["el:A"],
        nodes: [makeElementNode("el:A", "Frame-A")],
        frameResolution: makeFrameResolution("Frame-A"),
      },
      {
        key: makePresetKey(["Outer", "Inner"], "Frame-A"),
        label: "Inside Outer › Inner",
        targetParentPath: ["Outer", "Inner"],
        targetFrameId: "Frame-A",
      },
    )

    expect(harness.reparent).toHaveBeenCalledWith({
      elementIds: ["el:A"],
      sourceGroupId: null,
      targetParentPath: ["Outer", "Inner"],
      targetFrameId: "Frame-A",
    })

    expect(harness.setLastQuickMoveDestination).toHaveBeenCalledWith({
      kind: "preset",
      preset: {
        key: makePresetKey(["Outer", "Inner"], "Frame-A"),
        label: "Inside Outer › Inner",
        targetParentPath: ["Outer", "Inner"],
        targetFrameId: "Frame-A",
      },
    })
  })

  it("uses structural node intent for group-row quick moves", async () => {
    const harness = makeHarness()

    await harness.controller.applyGroupPreset(
      harness.actions,
      {
        elementIds: ["el:A", "el:B"],
        nodes: [makeGroupNode("G", ["el:A", "el:B"], "Frame-A")],
        frameResolution: makeFrameResolution("Frame-A"),
        structuralMove: {
          nodeIds: ["group:G"],
          sourceGroupId: "G",
        },
      },
      {
        key: makePresetKey(["Outer"], "Frame-A"),
        label: "Inside Outer",
        targetParentPath: ["Outer"],
        targetFrameId: "Frame-A",
      },
    )

    expect(harness.reparentFromNodeIds).toHaveBeenCalledWith({
      nodeIds: ["group:G"],
      sourceGroupId: "G",
      targetParentPath: ["Outer"],
      targetFrameId: "Frame-A",
    })
    expect(harness.reparent).not.toHaveBeenCalled()
  })

  it("fails closed for applyGroupPreset when selection includes frame rows", async () => {
    const harness = makeHarness()

    await harness.controller.applyGroupPreset(
      harness.actions,
      {
        elementIds: ["Frame-A"],
        nodes: [makeFrameNode("Frame-A")],
        frameResolution: makeFrameResolution("Frame-A"),
      },
      {
        key: makePresetKey(["G"], "Frame-A"),
        label: "Inside G",
        targetParentPath: ["G"],
        targetFrameId: "Frame-A",
      },
    )

    expect(harness.notify).toHaveBeenCalledWith(
      "Preset move failed: frame rows cannot be structurally moved.",
    )
    expect(harness.reparent).not.toHaveBeenCalled()
    expect(harness.setLastQuickMoveDestination).not.toHaveBeenCalled()
  })

  it("fails closed for applyGroupPreset when selection frame is incompatible", async () => {
    const harness = makeHarness()

    await harness.controller.applyGroupPreset(
      harness.actions,
      {
        elementIds: ["el:A"],
        nodes: [makeElementNode("el:A", "Frame-A")],
        frameResolution: makeFrameResolution("Frame-A"),
      },
      {
        key: makePresetKey(["G"], "Frame-B"),
        label: "Inside G",
        targetParentPath: ["G"],
        targetFrameId: "Frame-B",
      },
    )

    expect(harness.notify).toHaveBeenCalledWith(
      "Preset move failed: selected items are in a different frame.",
    )
    expect(harness.reparent).not.toHaveBeenCalled()
    expect(harness.setLastQuickMoveDestination).not.toHaveBeenCalled()
  })

  it("fails closed for moveSelectionToRoot when selection includes frame rows", async () => {
    const harness = makeHarness()

    await harness.controller.moveSelectionToRoot(harness.actions, {
      elementIds: ["Frame-A"],
      nodes: [makeFrameNode("Frame-A")],
      frameResolution: makeFrameResolution("Frame-A"),
    })

    expect(harness.notify).toHaveBeenCalledWith(
      "Move to root failed: frame rows cannot be structurally moved.",
    )
    expect(harness.reparent).not.toHaveBeenCalled()
    expect(harness.setLastQuickMoveDestination).not.toHaveBeenCalled()
  })

  it("fails closed for ungroupLikeSelection when selection includes frame rows", async () => {
    const harness = makeHarness()

    await harness.controller.ungroupLikeSelection(harness.actions, {
      elementIds: ["Frame-A"],
      nodes: [makeFrameNode("Frame-A")],
      frameResolution: makeFrameResolution("Frame-A"),
    })

    expect(harness.notify).toHaveBeenCalledWith(
      "Ungroup-like failed: frame rows cannot be structurally moved.",
    )
    expect(harness.beginInteraction).not.toHaveBeenCalled()
    expect(harness.reparent).not.toHaveBeenCalled()
  })

  it("executes ungroupLikeSelection confirmation and routes to move-to-root", async () => {
    const harness = makeHarness()

    await withPatchedGlobalPrompt(
      vi.fn(() => "UNGROUP"),
      async () => {
        await harness.controller.ungroupLikeSelection(harness.actions, {
          elementIds: ["el:A"],
          nodes: [makeElementNode("el:A", "Frame-A")],
          frameResolution: makeFrameResolution("Frame-A"),
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
      targetFrameId: "Frame-A",
    })
  })
})
