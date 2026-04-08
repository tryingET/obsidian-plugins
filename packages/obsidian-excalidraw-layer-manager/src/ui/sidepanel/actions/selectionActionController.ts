import type { LayerManagerUiActions } from "../../renderer.js"
import type { ResolvedSelection } from "../keyboard/keyboardShortcutController.js"
import type { SidepanelPromptInteractionService } from "../prompt/promptInteractionService.js"
import { type GroupReparentPreset, resolveSharedFrame } from "../quickmove/presetHelpers.js"
import type { LastQuickMoveDestination } from "../quickmove/quickMovePersistenceService.js"

interface SidepanelSelectionActionControllerHost {
  readonly notify: (message: string) => void
  readonly promptService: SidepanelPromptInteractionService
  readonly setLastQuickMoveDestination: (destination: LastQuickMoveDestination | null) => void
}

export class SidepanelSelectionActionController {
  readonly #host: SidepanelSelectionActionControllerHost

  constructor(host: SidepanelSelectionActionControllerHost) {
    this.#host = host
  }

  async groupSelected(
    actions: LayerManagerUiActions,
    selectedElementIds: readonly string[],
  ): Promise<void> {
    if (selectedElementIds.length < 2) {
      this.#host.notify("Create group requires at least two selected elements.")
      return
    }

    const promptResult = this.#host.promptService.promptWithInteraction(
      actions,
      "New group name (optional)",
      "Group",
      "Create group prompt unavailable: prompt API is missing in this host.",
    )

    if (promptResult.cancelled) {
      return
    }

    const nameSeed = promptResult.value.trim()

    if (nameSeed.length > 0) {
      await actions.commands.createGroup({
        elementIds: selectedElementIds,
        nameSeed,
      })
      return
    }

    await actions.commands.createGroup({
      elementIds: selectedElementIds,
    })
  }

  async reorderSelected(
    actions: LayerManagerUiActions,
    selectedElementIds: readonly string[],
  ): Promise<void> {
    if (selectedElementIds.length === 0) {
      this.#host.notify("Reorder requires at least one selected element.")
      return
    }

    await actions.commands.reorder({
      orderedElementIds: selectedElementIds,
    })
  }

  async applyGroupPreset(
    actions: LayerManagerUiActions,
    selection: ResolvedSelection,
    preset: GroupReparentPreset,
  ): Promise<void> {
    if (selection.elementIds.length === 0) {
      this.#host.notify("Preset move requires at least one selected element.")
      return
    }

    const frameResolution = resolveSharedFrame(selection.nodes)
    if (!frameResolution.ok) {
      this.#host.notify("Preset move failed: selected elements span multiple frames.")
      return
    }

    if (frameResolution.frameId !== preset.targetFrameId) {
      this.#host.notify("Preset move failed: selected elements are in a different frame.")
      return
    }

    const outcome = await actions.commands.reparent({
      elementIds: selection.elementIds,
      sourceGroupId: null,
      targetParentPath: preset.targetParentPath,
      targetFrameId: preset.targetFrameId,
    })

    if (outcome.status === "applied") {
      this.#host.setLastQuickMoveDestination({
        kind: "preset",
        preset,
      })
    }
  }

  async moveSelectionToRoot(
    actions: LayerManagerUiActions,
    selection: ResolvedSelection,
  ): Promise<void> {
    if (selection.elementIds.length === 0) {
      this.#host.notify("Move to root requires at least one selected element.")
      return
    }

    const frameResolution = resolveSharedFrame(selection.nodes)
    if (!frameResolution.ok) {
      this.#host.notify("Move to root failed: selected elements span multiple frames.")
      return
    }

    const outcome = await actions.commands.reparent({
      elementIds: selection.elementIds,
      sourceGroupId: null,
      targetParentPath: [],
      targetFrameId: frameResolution.frameId,
    })

    if (outcome.status === "applied") {
      this.#host.setLastQuickMoveDestination({
        kind: "root",
      })
    }
  }

  async ungroupLikeSelection(
    actions: LayerManagerUiActions,
    selection: ResolvedSelection,
  ): Promise<void> {
    if (selection.elementIds.length === 0) {
      this.#host.notify("Ungroup-like requires at least one selected element.")
      return
    }

    const promptResult = this.#host.promptService.promptWithInteraction(
      actions,
      'Type "UNGROUP" to clear group nesting for selected elements',
      "",
      "Ungroup confirmation unavailable: prompt API is missing in this host.",
    )

    if (promptResult.cancelled) {
      return
    }

    if (promptResult.value.trim().toUpperCase() !== "UNGROUP") {
      this.#host.notify("Ungroup-like cancelled.")
      return
    }

    await this.moveSelectionToRoot(actions, selection)
  }
}
