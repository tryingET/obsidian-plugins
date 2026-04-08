import type { LayerNode } from "../../../model/tree.js"
import {
  type SidepanelQuickMoveDestinationProjection,
  projectQuickMoveDestination,
  projectQuickMoveDestinations,
} from "../quickmove/destinationProjection.js"
import {
  type GroupReparentPreset,
  type SharedFrameResolution,
  truncateLabel,
} from "../quickmove/presetHelpers.js"
import type { LastQuickMoveDestination } from "../quickmove/quickMovePersistenceService.js"
import {
  type StructuralMoveSelection,
  resolveStructuralSelectionIssue,
} from "../selection/structuralMoveSelection.js"

interface SidepanelQuickMoveSelection {
  readonly elementIds: readonly string[]
  readonly nodes: readonly LayerNode[]
  readonly frameResolution: SharedFrameResolution
  readonly structuralMove?: StructuralMoveSelection | null
}

interface SidepanelQuickMoveRenderInput {
  readonly container: HTMLElement
  readonly ownerDocument: Document
  readonly hasActions: boolean
  readonly selection: SidepanelQuickMoveSelection
  readonly destinationProjection: SidepanelQuickMoveDestinationProjection
  readonly lastQuickMoveDestination: LastQuickMoveDestination | null
  readonly recentQuickMoveDestinations: readonly LastQuickMoveDestination[]
  readonly quickPresetInlineMax: number
  readonly lastMoveLabelMax: number
  readonly createToolbarButton: (
    ownerDocument: Document,
    label: string,
    action: () => Promise<unknown>,
  ) => HTMLButtonElement
  readonly onMoveSelectionToRoot: (targetFrameId: string | null) => Promise<void>
  readonly onApplyGroupPreset: (preset: GroupReparentPreset) => Promise<void>
  readonly onNotify: (message: string) => void
}

interface SidepanelQuickMoveRenderState {
  readonly hasSelection: boolean
  readonly frameResolution: SharedFrameResolution
  readonly selectionIssue: string | null
}

const RECENT_TARGET_BUTTON_MAX = 2

const resolveSelectionIssue = (
  selection: SidepanelQuickMoveSelection,
  _frameResolution: SharedFrameResolution,
): string | null => {
  return resolveStructuralSelectionIssue(selection)
}

const isPresetFrameCompatible = (
  frameResolution: SharedFrameResolution,
  preset: GroupReparentPreset,
): boolean => {
  return frameResolution.ok && frameResolution.frameId === preset.targetFrameId
}

const isRootFrameCompatible = (
  frameResolution: SharedFrameResolution,
  destination: Extract<LastQuickMoveDestination, { readonly kind: "root" }>,
): boolean => {
  return frameResolution.ok && frameResolution.frameId === destination.targetFrameId
}

const isDestinationFrameCompatible = (
  frameResolution: SharedFrameResolution,
  destination: LastQuickMoveDestination,
): boolean => {
  if (destination.kind === "root") {
    return isRootFrameCompatible(frameResolution, destination)
  }

  return isPresetFrameCompatible(frameResolution, destination.preset)
}

const describeRootDestination = (
  destination: Extract<LastQuickMoveDestination, { readonly kind: "root" }>,
  frameLabelById: ReadonlyMap<string, string>,
): string => {
  if (!destination.targetFrameId) {
    return "Canvas root"
  }

  const frameLabel = frameLabelById.get(destination.targetFrameId) ?? destination.targetFrameId
  return `Frame root: ${frameLabel}`
}

const appendUniquePreset = (
  target: GroupReparentPreset[],
  seenKeys: Set<string>,
  preset: GroupReparentPreset,
): void => {
  if (seenKeys.has(preset.key)) {
    return
  }

  seenKeys.add(preset.key)
  target.push(preset)
}

const buildPickerPresets = (
  basePresets: readonly GroupReparentPreset[],
  lastDestination: LastQuickMoveDestination | null,
  recentDestinations: readonly LastQuickMoveDestination[],
): readonly GroupReparentPreset[] => {
  const presets = [...basePresets]
  const seenKeys = new Set(basePresets.map((preset) => preset.key))

  if (lastDestination?.kind === "preset") {
    appendUniquePreset(presets, seenKeys, lastDestination.preset)
  }

  for (const destination of recentDestinations) {
    if (destination.kind !== "preset") {
      continue
    }

    appendUniquePreset(presets, seenKeys, destination.preset)
  }

  return presets
}

const isSameDestination = (
  left: LastQuickMoveDestination,
  right: LastQuickMoveDestination,
): boolean => {
  if (left.kind === "root" || right.kind === "root") {
    return (
      left.kind === "root" && right.kind === "root" && left.targetFrameId === right.targetFrameId
    )
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
    frameResolution: input.selection.frameResolution,
    selectionIssue: resolveSelectionIssue(input.selection, input.selection.frameResolution),
  }

  const projectedInput: SidepanelQuickMoveRenderInput = {
    ...input,
    lastQuickMoveDestination: projectQuickMoveDestination(
      input.lastQuickMoveDestination,
      input.destinationProjection.destinationByKey,
      input.destinationProjection.liveFrameIds,
    ),
    recentQuickMoveDestinations: projectQuickMoveDestinations(
      input.recentQuickMoveDestinations,
      input.destinationProjection.destinationByKey,
      input.destinationProjection.liveFrameIds,
    ),
  }

  const presetRow = createControlRow(projectedInput)
  appendRowTitle(presetRow, projectedInput, "Move selection:")

  appendLastQuickMoveControl(projectedInput, presetRow, renderState)
  appendRecentDestinationControls(projectedInput, presetRow, renderState)
  appendRootMoveControl(projectedInput, presetRow, renderState)

  if (input.destinationProjection.topLevelPresets.length <= projectedInput.quickPresetInlineMax) {
    appendInlinePresetButtons(
      projectedInput,
      presetRow,
      input.destinationProjection.topLevelPresets,
      renderState,
    )
  } else {
    appendPresetDropdown(
      projectedInput,
      presetRow,
      input.destinationProjection.topLevelPresets,
      renderState,
    )
  }

  const pickerPresets = buildPickerPresets(
    input.destinationProjection.allDestinations,
    projectedInput.lastQuickMoveDestination,
    projectedInput.recentQuickMoveDestinations,
  )

  if (pickerPresets.length > 0) {
    const pickerRow = createControlRow(projectedInput)
    appendRowTitle(pickerRow, projectedInput, "Destination picker:")
    appendDestinationPicker(
      projectedInput,
      pickerRow,
      pickerPresets,
      renderState,
      input.destinationProjection.destinationPickerWasCapped,
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
  const rootLabel =
    renderState.hasSelection &&
    input.lastQuickMoveDestination?.kind === "root" &&
    isRootFrameCompatible(renderState.frameResolution, input.lastQuickMoveDestination)
      ? "Root ★"
      : "Root"
  const rootButton = input.createToolbarButton(input.ownerDocument, rootLabel, async () => {
    await input.onMoveSelectionToRoot(renderState.frameResolution.frameId)
  })

  rootButton.disabled = !!renderState.selectionIssue

  if (renderState.selectionIssue) {
    rootButton.title = renderState.selectionIssue
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
    lastDestination.kind === "root"
      ? `↺ Last: ${describeRootDestination(lastDestination, input.destinationProjection.frameLabelById)}`
      : `↺ Last: ${lastDestination.preset.label}`

  const repeatButton = input.createToolbarButton(
    input.ownerDocument,
    truncateLabel(label, input.lastMoveLabelMax),
    async () => {
      if (lastDestination.kind === "root") {
        await input.onMoveSelectionToRoot(lastDestination.targetFrameId)
        return
      }

      await input.onApplyGroupPreset(lastDestination.preset)
    },
  )

  if (renderState.selectionIssue) {
    repeatButton.disabled = true
    repeatButton.title = renderState.selectionIssue
    presetRow.appendChild(repeatButton)
    return
  }

  if (
    lastDestination.kind === "root" &&
    !isRootFrameCompatible(renderState.frameResolution, lastDestination)
  ) {
    repeatButton.disabled = true
    repeatButton.title = "Last destination is in a different frame."
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
        ? describeRootDestination(destination, input.destinationProjection.frameLabelById)
        : truncateLabel(destination.preset.label, input.lastMoveLabelMax)

    const button = input.createToolbarButton(input.ownerDocument, buttonLabel, async () => {
      if (destination.kind === "root") {
        await input.onMoveSelectionToRoot(destination.targetFrameId)
        return
      }

      await input.onApplyGroupPreset(destination.preset)
    })

    if (renderState.selectionIssue) {
      button.disabled = true
      button.title = renderState.selectionIssue
      presetRow.appendChild(button)
      continue
    }

    if (!isDestinationFrameCompatible(renderState.frameResolution, destination)) {
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
    presetButton.disabled = !!renderState.selectionIssue || !isFrameCompatible

    if (renderState.selectionIssue) {
      presetButton.title = renderState.selectionIssue
    } else if (!isFrameCompatible) {
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

  if (renderState.selectionIssue) {
    select.disabled = true
    select.title = renderState.selectionIssue
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
      !renderState.selectionIssue &&
      isPresetFrameCompatible(renderState.frameResolution, preset)

    applyButton.disabled = !canApply

    if (renderState.selectionIssue) {
      applyButton.title = renderState.selectionIssue
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
    ? `All group destinations (${presets.length} shown, list capped)`
    : `All group destinations (${presets.length})`
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

  if (renderState.selectionIssue) {
    select.disabled = true
    select.title = renderState.selectionIssue
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
      !renderState.selectionIssue &&
      isPresetFrameCompatible(renderState.frameResolution, preset)

    applyButton.disabled = !canApply

    if (renderState.selectionIssue) {
      applyButton.title = renderState.selectionIssue
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
