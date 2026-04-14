import type { ReorderMode } from "../../../commands/reorderNode.js"
import { didInteractionApply } from "../../interactionOutcome.js"
import type { LayerManagerUiActions } from "../../renderer.js"
import type { SidepanelPromptInteractionService } from "../prompt/promptInteractionService.js"
import type { GroupReparentPreset } from "../quickmove/presetHelpers.js"
import type { LastQuickMoveDestination } from "../quickmove/quickMovePersistenceService.js"
import type { ResolvedSelection } from "../selection/selectionResolution.js"
import {
  resolveExplicitSelectionNodeIds,
  selectionIncludesFrameRows,
  selectionIncludesGroupRows,
} from "../selection/structuralMoveSelection.js"

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

const resolveStructuralReparentIssue = (
  selection: ResolvedSelection,
  actionLabel: string,
): string | null => {
  if (selection.elementIds.length === 0) {
    return `${actionLabel} requires at least one selected element.`
  }

  if (selectionIncludesFrameRows(selection)) {
    return `${actionLabel} failed: frame rows cannot be structurally moved.`
  }

  if (!selection.frameResolution.ok) {
    return `${actionLabel} failed: selected items span multiple frames.`
  }

  if (selectionIncludesGroupRows(selection) && !selection.structuralMove) {
    return `${actionLabel} failed: mixed or multiple group rows are not supported.`
  }

  return null
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

  async groupSelected(actions: LayerManagerUiActions, selection: ResolvedSelection): Promise<void> {
    if (selection.elementIds.length < 2) {
      this.#host.notify("Create group requires at least two selected elements.")
      return
    }

    const explicitSelectedNodeIds = resolveExplicitSelectionNodeIds(selection)
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

    if (explicitSelectedNodeIds.length > 0) {
      await actions.createGroupFromNodeIds(
        nameSeed.length > 0
          ? {
              nodeIds: explicitSelectedNodeIds,
              nameSeed,
            }
          : {
              nodeIds: explicitSelectedNodeIds,
            },
      )
      return
    }

    if (nameSeed.length > 0) {
      await actions.commands.createGroup({
        elementIds: selection.elementIds,
        nameSeed,
      })
      return
    }

    await actions.commands.createGroup({
      elementIds: selection.elementIds,
    })
  }

  async reorderSelected(
    actions: LayerManagerUiActions,
    selection: ResolvedSelection,
    mode: ReorderMode,
  ): Promise<void> {
    const explicitSelectedNodeIds = resolveExplicitSelectionNodeIds(selection)
    if (explicitSelectedNodeIds.length > 0) {
      await actions.reorderFromNodeIds(explicitSelectedNodeIds, mode)
      return
    }

    if (selection.elementIds.length === 0) {
      this.#host.notify("Reorder requires at least one selected element.")
      return
    }

    await actions.commands.reorder({
      orderedElementIds: selection.elementIds,
      mode,
    })
  }

  async applyGroupPreset(
    actions: LayerManagerUiActions,
    selection: ResolvedSelection,
    preset: GroupReparentPreset,
  ): Promise<void> {
    const selectionIssue = resolveStructuralReparentIssue(selection, "Preset move")
    if (selectionIssue) {
      this.#host.notify(selectionIssue)
      return
    }

    const frameResolution = selection.frameResolution

    if (frameResolution.frameId !== preset.targetFrameId) {
      this.#host.notify("Preset move failed: selected items are in a different frame.")
      return
    }

    const outcome = await runSelectionReparent(actions, selection, {
      targetParentPath: preset.targetParentPath,
      targetFrameId: preset.targetFrameId,
    })

    if (didInteractionApply(outcome)) {
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
    const selectionIssue = resolveStructuralReparentIssue(selection, "Move to root")
    if (selectionIssue) {
      this.#host.notify(selectionIssue)
      return
    }

    const frameResolution = selection.frameResolution

    if (frameResolution.frameId !== targetFrameId) {
      this.#host.notify("Move to root failed: selected items are in a different frame.")
      return
    }

    const outcome = await runSelectionReparent(actions, selection, {
      targetParentPath: [],
      targetFrameId,
    })

    if (didInteractionApply(outcome)) {
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
    const selectionIssue = resolveStructuralReparentIssue(selection, "Ungroup-like")
    if (selectionIssue) {
      this.#host.notify(selectionIssue)
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
