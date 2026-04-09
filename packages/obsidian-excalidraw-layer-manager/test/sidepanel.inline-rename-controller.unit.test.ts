import { describe, expect, it, vi } from "vitest"

import type { LayerManagerUiActions } from "../src/ui/renderer.js"
import { SidepanelInlineRenameController } from "../src/ui/sidepanel/rename/inlineRenameController.js"

const makeHostHarness = () => {
  const notify = vi.fn<(message: string) => void>()
  const requestRenderFromLatestModel = vi.fn<() => void>()
  const setShouldAutofocusContentRoot = vi.fn<(value: boolean) => void>()
  const focusContentRoot = vi.fn<() => void>()
  const suppressNextContentFocusOut = vi.fn<() => void>()
  const debugInteraction = vi.fn<(message: string, payload?: Record<string, unknown>) => void>()

  let focusedNodeId: string | null = "el:A"
  let keyboardCaptureActive = true

  const controller = new SidepanelInlineRenameController({
    notify,
    requestRenderFromLatestModel,
    setShouldAutofocusContentRoot,
    focusContentRoot,
    suppressNextContentFocusOut,
    getFocusedNodeId: () => focusedNodeId,
    getKeyboardCaptureActive: () => keyboardCaptureActive,
    debugInteraction,
  })

  return {
    controller,
    notify,
    requestRenderFromLatestModel,
    setShouldAutofocusContentRoot,
    focusContentRoot,
    suppressNextContentFocusOut,
    debugInteraction,
    setFocusedNodeId: (value: string | null) => {
      focusedNodeId = value
    },
    setKeyboardCaptureActive: (value: boolean) => {
      keyboardCaptureActive = value
    },
  }
}

const makeActions = () => {
  const renameNode = vi.fn(async () => ({ status: "applied", attempts: 1 as const }))

  return {
    actions: {
      renameNode,
    } as unknown as LayerManagerUiActions,
    renameNode,
  }
}

describe("sidepanel inline rename controller", () => {
  it("begins inline rename and avoids duplicate rerender for identical state", () => {
    const harness = makeHostHarness()

    harness.controller.beginInlineRename("el:A", "Initial")
    expect(harness.controller.state).toEqual({
      nodeId: "el:A",
      draft: "Initial",
      shouldAutofocusInput: true,
    })
    expect(harness.requestRenderFromLatestModel).toHaveBeenCalledTimes(1)

    harness.controller.beginInlineRename("el:A", "Initial")
    expect(harness.requestRenderFromLatestModel).toHaveBeenCalledTimes(1)
  })

  it("updates rename draft and marks autofocus as handled", () => {
    const harness = makeHostHarness()

    harness.controller.beginInlineRename("el:A", "Initial")
    harness.controller.updateInlineRenameDraft("Updated")

    expect(harness.controller.state).toEqual({
      nodeId: "el:A",
      draft: "Updated",
      shouldAutofocusInput: false,
    })

    harness.controller.markAutofocusHandled("el:A")
    expect(harness.controller.state?.shouldAutofocusInput).toBe(false)
  })

  it("cancels inline rename and restores content-root focus ownership", () => {
    const harness = makeHostHarness()

    harness.controller.beginInlineRename("el:A", "Initial")
    harness.controller.cancelInlineRename()

    expect(harness.controller.state).toBeNull()
    expect(harness.setShouldAutofocusContentRoot).toHaveBeenCalledWith(true)
    expect(harness.focusContentRoot).toHaveBeenCalledTimes(1)
    expect(harness.requestRenderFromLatestModel).toHaveBeenCalledTimes(2)
  })

  it("fails closed for empty names and keeps inline editor open", async () => {
    const harness = makeHostHarness()
    const { actions, renameNode } = makeActions()

    harness.controller.beginInlineRename("el:A", "Initial")
    harness.controller.updateInlineRenameDraft("   ")
    await harness.controller.commitInlineRename(actions, "el:A")

    expect(renameNode).not.toHaveBeenCalled()
    expect(harness.notify).toHaveBeenCalledWith("Rename failed: name cannot be empty.")
    expect(harness.controller.nodeId).toBe("el:A")
  })

  it("preserves inline rename draft until a known applied outcome exists", async () => {
    const harness = makeHostHarness()
    const renameNode = vi.fn(async () => ({
      status: "plannerError" as const,
      error: "rename drifted",
      attempts: 1 as const,
    }))

    harness.controller.beginInlineRename("el:A", "Initial")
    harness.controller.updateInlineRenameDraft("  Keep me  ")
    await harness.controller.commitInlineRename(
      {
        renameNode,
      } as unknown as LayerManagerUiActions,
      "el:A",
    )

    expect(renameNode).toHaveBeenCalledWith("el:A", "Keep me")
    expect(harness.controller.state).toEqual({
      nodeId: "el:A",
      draft: "  Keep me  ",
      shouldAutofocusInput: false,
    })
    expect(harness.suppressNextContentFocusOut).not.toHaveBeenCalled()
    expect(harness.focusContentRoot).not.toHaveBeenCalled()
  })

  it("commits valid rename, trims value, and restores focus", async () => {
    const harness = makeHostHarness()
    const { actions, renameNode } = makeActions()

    harness.setFocusedNodeId("el:A")
    harness.setKeyboardCaptureActive(true)

    harness.controller.beginInlineRename("el:A", "Initial")
    harness.controller.updateInlineRenameDraft("  Renamed  ")
    await harness.controller.commitInlineRename(actions, "el:A")

    expect(renameNode).toHaveBeenCalledWith("el:A", "Renamed")
    expect(harness.controller.state).toBeNull()
    expect(harness.suppressNextContentFocusOut).toHaveBeenCalledTimes(1)
    expect(harness.setShouldAutofocusContentRoot).toHaveBeenCalledWith(true)
    expect(harness.focusContentRoot).toHaveBeenCalledTimes(1)
    expect(harness.requestRenderFromLatestModel.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(harness.debugInteraction).toHaveBeenCalled()
  })
})
