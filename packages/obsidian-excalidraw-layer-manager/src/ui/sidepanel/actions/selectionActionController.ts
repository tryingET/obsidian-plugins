import type { LayerManagerUiActions } from "../../renderer.js"
import type { ResolvedSelection } from "../keyboard/keyboardShortcutController.js"
import type { SidepanelPromptInteractionService } from "../prompt/promptInteractionService.js"
import {
  type GroupReparentPreset,
  makePresetKey,
  makePresetLabel,
  resolveSharedFrame,
} from "../quickmove/presetHelpers.js"
import type { LastQuickMoveDestination } from "../quickmove/quickMovePersistenceService.js"

interface SidepanelSelectionActionControllerHost {
  readonly notify: (message: string) => void
  readonly promptService: SidepanelPromptInteractionService
  readonly setLastQuickMoveDestination: (destination: LastQuickMoveDestination | null) => void
}

type ReparentPromptResolution =
  | {
      readonly cancelled: true
    }
  | {
      readonly cancelled: false
      readonly targetPathRaw: string
      readonly sourceGroupRaw: string
      readonly targetFrameRaw: string
    }

const parseParentPath = (value: string): readonly string[] => {
  return value
    .split(/[>/]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
}

const normalizeOptionalInput = (value: string): string | null => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  return trimmed
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

  async reparentSelected(
    actions: LayerManagerUiActions,
    selection: ResolvedSelection,
  ): Promise<void> {
    if (selection.elementIds.length === 0) {
      this.#host.notify("Reparent requires at least one selected element.")
      return
    }

    const frameResolution = resolveSharedFrame(selection.nodes)

    const promptResolution = this.#host.promptService.withInteractionWindow(
      actions,
      (): ReparentPromptResolution => {
        const targetPathPrompt = this.#host.promptService.promptRaw(
          "Target parent path (outer > inner). Leave blank for root.",
          "",
        )
        if (!targetPathPrompt.available) {
          this.#host.notify("Reparent prompt unavailable: prompt API is missing in this host.")
          return {
            cancelled: true,
          }
        }

        if (targetPathPrompt.value === null) {
          return {
            cancelled: true,
          }
        }

        const sourceGroupPrompt = this.#host.promptService.promptRaw(
          "Source group ID (optional). Leave blank when not moving out of a group.",
          "",
        )
        if (!sourceGroupPrompt.available) {
          this.#host.notify("Reparent prompt unavailable: prompt API is missing in this host.")
          return {
            cancelled: true,
          }
        }

        if (sourceGroupPrompt.value === null) {
          return {
            cancelled: true,
          }
        }

        const targetFramePrompt = this.#host.promptService.promptRaw(
          "Target frame ID (optional). Leave blank to keep inferred frame.",
          frameResolution.frameId ?? "",
        )
        if (!targetFramePrompt.available) {
          this.#host.notify("Reparent prompt unavailable: prompt API is missing in this host.")
          return {
            cancelled: true,
          }
        }

        if (targetFramePrompt.value === null) {
          return {
            cancelled: true,
          }
        }

        return {
          cancelled: false,
          targetPathRaw: targetPathPrompt.value,
          sourceGroupRaw: sourceGroupPrompt.value,
          targetFrameRaw: targetFramePrompt.value,
        }
      },
    )

    if (promptResolution.cancelled) {
      return
    }

    const targetParentPath = parseParentPath(promptResolution.targetPathRaw)
    const sourceGroupId = normalizeOptionalInput(promptResolution.sourceGroupRaw)
    const explicitFrameId = normalizeOptionalInput(promptResolution.targetFrameRaw)
    const targetFrameId = explicitFrameId ?? frameResolution.frameId

    const outcome = await actions.commands.reparent({
      elementIds: selection.elementIds,
      sourceGroupId,
      targetParentPath,
      targetFrameId,
    })

    if (outcome.status !== "applied") {
      return
    }

    if (targetParentPath.length === 0) {
      this.#host.setLastQuickMoveDestination({
        kind: "root",
      })
      return
    }

    this.#host.setLastQuickMoveDestination({
      kind: "preset",
      preset: {
        key: makePresetKey(targetParentPath, targetFrameId),
        label: makePresetLabel(targetParentPath),
        targetParentPath: [...targetParentPath],
        targetFrameId,
      },
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
