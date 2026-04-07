import type { LayerNode } from "../../../model/tree.js"
import {
  type GroupReparentPreset,
  type SharedFrameResolution,
  collectTopLevelGroupReparentPresets,
  resolveSharedFrame,
  truncateLabel,
} from "../quickmove/presetHelpers.js"
import type { LastQuickMoveDestination } from "../quickmove/quickMovePersistenceService.js"

interface SidepanelQuickMoveSelection {
  readonly elementIds: readonly string[]
  readonly nodes: readonly LayerNode[]
}

interface SidepanelQuickMoveRenderInput {
  readonly container: HTMLElement
  readonly ownerDocument: Document
  readonly hasActions: boolean
  readonly tree: readonly LayerNode[]
  readonly selection: SidepanelQuickMoveSelection
  readonly lastQuickMoveDestination: LastQuickMoveDestination | null
  readonly quickPresetInlineMax: number
  readonly quickPresetTotalMax: number
  readonly lastMoveLabelMax: number
  readonly createToolbarButton: (
    ownerDocument: Document,
    label: string,
    action: () => Promise<unknown>,
  ) => HTMLButtonElement
  readonly onMoveSelectionToRoot: () => Promise<void>
  readonly onApplyGroupPreset: (preset: GroupReparentPreset) => Promise<void>
  readonly onNotify: (message: string) => void
}

interface SidepanelQuickMoveRenderState {
  readonly hasSelection: boolean
  readonly frameResolution: SharedFrameResolution
}

const isPresetFrameCompatible = (
  frameResolution: SharedFrameResolution,
  preset: GroupReparentPreset,
): boolean => {
  return frameResolution.ok && frameResolution.frameId === preset.targetFrameId
}

export const renderSidepanelQuickMove = (
  input: SidepanelQuickMoveRenderInput,
): HTMLDivElement | null => {
  if (!input.hasActions) {
    return null
  }

  const presetRow = input.ownerDocument.createElement("div")
  presetRow.style.display = "flex"
  presetRow.style.flexWrap = "wrap"
  presetRow.style.alignItems = "center"
  presetRow.style.gap = "4px"
  presetRow.style.marginBottom = "6px"
  input.container.appendChild(presetRow)

  const title = input.ownerDocument.createElement("span")
  title.textContent = "Quick move (top-level groups):"
  title.style.fontSize = "11px"
  title.style.opacity = "0.75"
  title.style.paddingRight = "2px"
  presetRow.appendChild(title)

  const renderState: SidepanelQuickMoveRenderState = {
    hasSelection: input.selection.elementIds.length > 0,
    frameResolution: resolveSharedFrame(input.selection.nodes),
  }

  appendLastQuickMoveControl(input, presetRow, renderState)
  appendRootMoveControl(input, presetRow, renderState)

  const presets = collectTopLevelGroupReparentPresets(input.tree, input.quickPresetTotalMax)

  if (presets.length <= input.quickPresetInlineMax) {
    appendInlinePresetButtons(input, presetRow, presets, renderState)
    return presetRow
  }

  appendPresetDropdown(input, presetRow, presets, renderState)
  return presetRow
}

const appendRootMoveControl = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  renderState: SidepanelQuickMoveRenderState,
): void => {
  const rootLabel = input.lastQuickMoveDestination?.kind === "root" ? "Root ★" : "Root"
  const rootButton = input.createToolbarButton(input.ownerDocument, rootLabel, async () => {
    await input.onMoveSelectionToRoot()
  })

  rootButton.disabled = !renderState.hasSelection || !renderState.frameResolution.ok

  if (renderState.hasSelection && !renderState.frameResolution.ok) {
    rootButton.title = "Selection spans multiple frames."
  }

  presetRow.appendChild(rootButton)
}

const appendLastQuickMoveControl = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  renderState: SidepanelQuickMoveRenderState,
): void => {
  const lastDestination = input.lastQuickMoveDestination
  if (!lastDestination) {
    return
  }

  const label =
    lastDestination.kind === "root" ? "↺ Last: Root" : `↺ Last: ${lastDestination.preset.label}`

  const repeatButton = input.createToolbarButton(
    input.ownerDocument,
    truncateLabel(label, input.lastMoveLabelMax),
    async () => {
      if (lastDestination.kind === "root") {
        await input.onMoveSelectionToRoot()
        return
      }

      await input.onApplyGroupPreset(lastDestination.preset)
    },
  )

  if (!renderState.hasSelection) {
    repeatButton.disabled = true
    repeatButton.title = "Select elements in canvas first."
    presetRow.appendChild(repeatButton)
    return
  }

  if (!renderState.frameResolution.ok) {
    repeatButton.disabled = true
    repeatButton.title = "Selection spans multiple frames."
    presetRow.appendChild(repeatButton)
    return
  }

  if (
    lastDestination.kind === "preset" &&
    !isPresetFrameCompatible(renderState.frameResolution, lastDestination.preset)
  ) {
    repeatButton.disabled = true
    repeatButton.title = "Last destination is in a different frame."
    presetRow.appendChild(repeatButton)
    return
  }

  presetRow.appendChild(repeatButton)
}

const appendInlinePresetButtons = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  presets: readonly GroupReparentPreset[],
  renderState: SidepanelQuickMoveRenderState,
): void => {
  for (const preset of presets) {
    const lastDestination = input.lastQuickMoveDestination
    const isLastPreset =
      lastDestination?.kind === "preset" && lastDestination.preset.key === preset.key

    const presetLabel = isLastPreset ? `${preset.label} ★` : preset.label
    const presetButton = input.createToolbarButton(input.ownerDocument, presetLabel, async () => {
      await input.onApplyGroupPreset(preset)
    })

    const isFrameCompatible = isPresetFrameCompatible(renderState.frameResolution, preset)
    presetButton.disabled = !renderState.hasSelection || !isFrameCompatible

    if (renderState.hasSelection && renderState.frameResolution.ok && !isFrameCompatible) {
      presetButton.title = "Preset is in a different frame than the current selection."
    }

    presetRow.appendChild(presetButton)
  }
}

const appendPresetDropdown = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  presets: readonly GroupReparentPreset[],
  renderState: SidepanelQuickMoveRenderState,
): void => {
  const presetByKey = new Map(presets.map((preset) => [preset.key, preset]))
  const lastPresetKey =
    input.lastQuickMoveDestination?.kind === "preset"
      ? input.lastQuickMoveDestination.preset.key
      : null

  const select = input.ownerDocument.createElement("select")
  select.style.fontSize = "11px"
  select.style.padding = "0"
  select.style.maxWidth = "180px"
  select.style.border = "none"
  select.style.boxShadow = "none"
  select.style.background = "transparent"

  const placeholder = input.ownerDocument.createElement("option")
  placeholder.value = ""
  placeholder.textContent = `Top-level groups (${presets.length})`
  select.appendChild(placeholder)

  let compatibleCount = 0

  for (const preset of presets) {
    const option = input.ownerDocument.createElement("option")
    option.value = preset.key
    option.textContent = preset.key === lastPresetKey ? `${preset.label} ★` : preset.label

    const isFrameCompatible = isPresetFrameCompatible(renderState.frameResolution, preset)
    if (renderState.hasSelection && renderState.frameResolution.ok && !isFrameCompatible) {
      option.disabled = true
    }

    if (isFrameCompatible) {
      compatibleCount += 1
    }

    select.appendChild(option)
  }

  if (lastPresetKey && presetByKey.has(lastPresetKey)) {
    select.value = lastPresetKey
  }

  if (!renderState.hasSelection) {
    select.disabled = true
    select.title = "Select elements in canvas first."
  } else if (!renderState.frameResolution.ok) {
    select.disabled = true
    select.title = "Selection spans multiple frames."
  } else if (compatibleCount === 0) {
    select.disabled = true
    select.title = "No compatible top-level group presets for this frame."
  }

  const applyButton = input.createToolbarButton(input.ownerDocument, "Move", async () => {
    const selectedKey = select.value
    const preset = presetByKey.get(selectedKey)

    if (!preset) {
      input.onNotify("Choose a top-level group preset first.")
      return
    }

    await input.onApplyGroupPreset(preset)
  })

  const updateApplyState = (): void => {
    const selectedKey = select.value
    const preset = presetByKey.get(selectedKey)

    const canApply =
      !!preset &&
      renderState.hasSelection &&
      renderState.frameResolution.ok &&
      isPresetFrameCompatible(renderState.frameResolution, preset)

    applyButton.disabled = !canApply

    if (!renderState.hasSelection) {
      applyButton.title = "Select elements in canvas first."
      return
    }

    if (!renderState.frameResolution.ok) {
      applyButton.title = "Selection spans multiple frames."
      return
    }

    if (!preset) {
      applyButton.title = "Choose a destination preset."
      return
    }

    if (!isPresetFrameCompatible(renderState.frameResolution, preset)) {
      applyButton.title = "Preset is in a different frame than the current selection."
      return
    }

    applyButton.title = ""
  }

  select.addEventListener("change", updateApplyState)
  updateApplyState()

  presetRow.appendChild(select)
  presetRow.appendChild(applyButton)
}
