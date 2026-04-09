import type { ReorderMode } from "../../../commands/reorderNode.js"
import type { LayerManagerUiActions } from "../../renderer.js"
import type { SidepanelPromptInteractionService } from "../prompt/promptInteractionService.js"
import type { GroupReparentPreset } from "../quickmove/presetHelpers.js"
import type { LastQuickMoveDestination } from "../quickmove/quickMovePersistenceService.js"
import type { ResolvedSelection } from "../selection/selectionResolution.js"
import { selectionIncludesFrameRows } from "../selection/structuralMoveSelection.js"

const runSelectionReparent = async (
  actions: LayerManagerUiActions,
  selection: ResolvedSelection,
  input: {
    readonly targetParentPath: readonly string[]
    readonly targetFrameId: string | null
  },
) => {
  if (selection.structuralMove) {
    return actions.reparentFromNodeIds({
      nodeIds: selection.structuralMove.nodeIds,
      sourceGroupId: selection.structuralMove.sourceGroupId,
      targetParentPath: input.targetParentPath,
      targetFrameId: input.targetFrameId,
    })
  }

  return actions.commands.reparent({
    elementIds: selection.elementIds,
    sourceGroupId: null,
    targetParentPath: input.targetParentPath,
    targetFrameId: input.targetFrameId,
  })
}

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
    mode: ReorderMode,
  ): Promise<void> {
    if (selectedElementIds.length === 0) {
      this.#host.notify("Reorder requires at least one selected element.")
      return
    }

    await actions.commands.reorder({
      orderedElementIds: selectedElementIds,
      mode,
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

    if (selectionIncludesFrameRows(selection)) {
      this.#host.notify("Preset move failed: frame rows cannot be structurally moved.")
      return
    }

    const frameResolution = selection.frameResolution
    if (!frameResolution.ok) {
      this.#host.notify("Preset move failed: selected items span multiple frames.")
      return
    }

    if (frameResolution.frameId !== preset.targetFrameId) {
      this.#host.notify("Preset move failed: selected items are in a different frame.")
      return
    }

    const outcome = await runSelectionReparent(actions, selection, {
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
    targetFrameId = selection.frameResolution.frameId,
  ): Promise<void> {
    if (selection.elementIds.length === 0) {
      this.#host.notify("Move to root requires at least one selected element.")
      return
    }

    if (selectionIncludesFrameRows(selection)) {
      this.#host.notify("Move to root failed: frame rows cannot be structurally moved.")
      return
    }

    const frameResolution = selection.frameResolution
    if (!frameResolution.ok) {
      this.#host.notify("Move to root failed: selected items span multiple frames.")
      return
    }

    if (frameResolution.frameId !== targetFrameId) {
      this.#host.notify("Move to root failed: selected items are in a different frame.")
      return
    }

    const outcome = await runSelectionReparent(actions, selection, {
      targetParentPath: [],
      targetFrameId,
    })

    if (outcome.status === "applied") {
      this.#host.setLastQuickMoveDestination({
        kind: "root",
        targetFrameId,
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

    if (selectionIncludesFrameRows(selection)) {
      this.#host.notify("Ungroup-like failed: frame rows cannot be structurally moved.")
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
