import type { LayerNode } from "../../../model/tree.js"
import {
  type GroupReparentPreset,
  type SharedFrameResolution,
  collectAllGroupReparentPresets,
  collectTopLevelGroupReparentPresets,
  makePresetOptionLabel,
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
  readonly recentQuickMoveDestinations: readonly LastQuickMoveDestination[]
  readonly quickPresetInlineMax: number
  readonly quickPresetTotalMax: number
  readonly allDestinationTotalMax: number
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

const RECENT_TARGET_BUTTON_MAX = 2

const isPresetFrameCompatible = (
  frameResolution: SharedFrameResolution,
  preset: GroupReparentPreset,
): boolean => {
  return frameResolution.ok && frameResolution.frameId === preset.targetFrameId
}

const isSameDestination = (
  left: LastQuickMoveDestination,
  right: LastQuickMoveDestination,
): boolean => {
  if (left.kind === "root" || right.kind === "root") {
    return left.kind === right.kind
  }

  return left.preset.key === right.preset.key
}

export const renderSidepanelQuickMove = (
  input: SidepanelQuickMoveRenderInput,
): HTMLDivElement | null => {
  if (!input.hasActions) {
    return null
  }

  const renderState: SidepanelQuickMoveRenderState = {
    hasSelection: input.selection.elementIds.length > 0,
    frameResolution: resolveSharedFrame(input.selection.nodes),
  }

  const presetRow = createControlRow(input)
  appendRowTitle(presetRow, input, "Move selection:")

  appendLastQuickMoveControl(input, presetRow, renderState)
  appendRecentDestinationControls(input, presetRow, renderState)
  appendRootMoveControl(input, presetRow, renderState)

  const topLevelPresets = collectTopLevelGroupReparentPresets(input.tree, input.quickPresetTotalMax)

  if (topLevelPresets.length <= input.quickPresetInlineMax) {
    appendInlinePresetButtons(input, presetRow, topLevelPresets, renderState)
  } else {
    appendPresetDropdown(input, presetRow, topLevelPresets, renderState)
  }

  const allDestinationCandidates = collectAllGroupReparentPresets(
    input.tree,
    input.allDestinationTotalMax + 1,
  )
  const allDestinations = allDestinationCandidates.slice(0, input.allDestinationTotalMax)
  const destinationPickerWasCapped = allDestinationCandidates.length > input.allDestinationTotalMax

  if (allDestinations.length > 0) {
    const pickerRow = createControlRow(input)
    appendRowTitle(pickerRow, input, "Destination picker:")
    appendDestinationPicker(
      input,
      pickerRow,
      allDestinations,
      renderState,
      destinationPickerWasCapped,
    )
  }

  return presetRow
}

const createControlRow = (input: SidepanelQuickMoveRenderInput): HTMLDivElement => {
  const row = input.ownerDocument.createElement("div")
  row.style.display = "flex"
  row.style.flexWrap = "wrap"
  row.style.alignItems = "center"
  row.style.gap = "4px"
  row.style.marginBottom = "6px"
  input.container.appendChild(row)
  return row
}

const appendRowTitle = (
  row: HTMLElement,
  input: SidepanelQuickMoveRenderInput,
  label: string,
): void => {
  const title = input.ownerDocument.createElement("span")
  title.textContent = label
  title.style.fontSize = "11px"
  title.style.opacity = "0.75"
  title.style.paddingRight = "2px"
  row.appendChild(title)
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

const appendRecentDestinationControls = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  renderState: SidepanelQuickMoveRenderState,
): void => {
  const recentDestinations = input.recentQuickMoveDestinations
    .filter((destination) => {
      if (destination.kind === "root") {
        return false
      }

      const lastDestination = input.lastQuickMoveDestination
      if (!lastDestination) {
        return true
      }

      return !isSameDestination(destination, lastDestination)
    })
    .slice(0, RECENT_TARGET_BUTTON_MAX)

  if (recentDestinations.length === 0) {
    return
  }

  const recentLabel = input.ownerDocument.createElement("span")
  recentLabel.textContent = "Recent:"
  recentLabel.style.fontSize = "11px"
  recentLabel.style.opacity = "0.75"
  presetRow.appendChild(recentLabel)

  for (const destination of recentDestinations) {
    const buttonLabel =
      destination.kind === "root"
        ? "Root"
        : truncateLabel(destination.preset.label, input.lastMoveLabelMax)

    const button = input.createToolbarButton(input.ownerDocument, buttonLabel, async () => {
      if (destination.kind === "root") {
        await input.onMoveSelectionToRoot()
        return
      }

      await input.onApplyGroupPreset(destination.preset)
    })

    if (!renderState.hasSelection) {
      button.disabled = true
      button.title = "Select elements in canvas first."
      presetRow.appendChild(button)
      continue
    }

    if (!renderState.frameResolution.ok) {
      button.disabled = true
      button.title = "Selection spans multiple frames."
      presetRow.appendChild(button)
      continue
    }

    if (
      destination.kind === "preset" &&
      !isPresetFrameCompatible(renderState.frameResolution, destination.preset)
    ) {
      button.disabled = true
      button.title = "Recent destination is in a different frame."
    }

    presetRow.appendChild(button)
  }
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

const appendDestinationPicker = (
  input: SidepanelQuickMoveRenderInput,
  pickerRow: HTMLElement,
  presets: readonly GroupReparentPreset[],
  renderState: SidepanelQuickMoveRenderState,
  wasCapped: boolean,
): void => {
  const presetByKey = new Map(presets.map((preset) => [preset.key, preset]))
  const lastPresetKey =
    input.lastQuickMoveDestination?.kind === "preset"
      ? input.lastQuickMoveDestination.preset.key
      : null

  const select = input.ownerDocument.createElement("select")
  select.style.fontSize = "11px"
  select.style.padding = "0"
  select.style.maxWidth = "220px"
  select.style.border = "none"
  select.style.boxShadow = "none"
  select.style.background = "transparent"

  const placeholder = input.ownerDocument.createElement("option")
  placeholder.value = ""
  placeholder.textContent = wasCapped
    ? `All group destinations (showing first ${presets.length})`
    : `All group destinations (${presets.length})`
  select.appendChild(placeholder)

  let compatibleCount = 0

  for (const preset of presets) {
    const option = input.ownerDocument.createElement("option")
    option.value = preset.key
    option.textContent =
      preset.key === lastPresetKey
        ? `${makePresetOptionLabel(preset.targetParentPath)} ★`
        : makePresetOptionLabel(preset.targetParentPath)

    const isFrameCompatible = isPresetFrameCompatible(renderState.frameResolution, preset)
    if (renderState.hasSelection && renderState.frameResolution.ok && !isFrameCompatible) {
      option.disabled = true
    }

    if (isFrameCompatible) {
      compatibleCount += 1
    }

    select.appendChild(option)
  }

  if (!renderState.hasSelection) {
    select.disabled = true
    select.title = "Select elements in canvas first."
  } else if (!renderState.frameResolution.ok) {
    select.disabled = true
    select.title = "Selection spans multiple frames."
  } else if (compatibleCount === 0) {
    select.disabled = true
    select.title = "No compatible group destinations for this frame."
  }

  const applyButton = input.createToolbarButton(input.ownerDocument, "Move to picked", async () => {
    const selectedKey = select.value
    const preset = presetByKey.get(selectedKey)

    if (!preset) {
      input.onNotify("Choose a destination from the picker first.")
      return
    }

    await input.onApplyGroupPreset(preset)
  })

  const updateApplyState = (): void => {
    const preset = presetByKey.get(select.value)
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
      applyButton.title = "Choose a destination from the picker."
      return
    }

    if (!isPresetFrameCompatible(renderState.frameResolution, preset)) {
      applyButton.title = "Destination is in a different frame than the current selection."
      return
    }

    applyButton.title = ""
  }

  select.addEventListener("change", updateApplyState)
  updateApplyState()

  pickerRow.appendChild(select)
  pickerRow.appendChild(applyButton)
}
