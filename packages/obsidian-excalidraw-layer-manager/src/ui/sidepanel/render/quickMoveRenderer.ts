import type { LayerNode } from "../../../model/tree.js"
import {
  type SidepanelQuickMoveDestinationProjection,
  isDestinationFrameCompatible,
  isPresetFrameCompatible,
  isRootFrameCompatible,
  projectQuickMoveDestination,
  projectQuickMoveDestinations,
  rankGroupReparentPresetsByCompatibility,
  rankQuickMoveDestinationsByCompatibility,
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

interface SidepanelQuickMoveReviewScope {
  readonly active: boolean
  readonly matchingRowCount: number
  readonly contextRowCount: number
}

interface SidepanelQuickMoveRenderInput {
  readonly container: HTMLElement
  readonly ownerDocument: Document
  readonly hasActions: boolean
  readonly selection: SidepanelQuickMoveSelection
  readonly reviewScope: SidepanelQuickMoveReviewScope
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

const describeFrameSurface = (
  targetFrameId: string | null,
  frameLabelById: ReadonlyMap<string, string>,
): string => {
  if (!targetFrameId) {
    return "canvas"
  }

  return `frame ${frameLabelById.get(targetFrameId) ?? targetFrameId}`
}

const describePresetDestinationOptionLabel = (
  preset: GroupReparentPreset,
  frameLabelById: ReadonlyMap<string, string>,
): string => {
  return `${preset.label} · ${describeFrameSurface(preset.targetFrameId, frameLabelById)}`
}

const describePresetDestinationTitle = (
  preset: GroupReparentPreset,
  frameLabelById: ReadonlyMap<string, string>,
): string => {
  const pathLabel =
    preset.targetParentPath.length > 0 ? ` · path ${preset.targetParentPath.join(" / ")}` : ""

  return `${preset.label} · ${describeFrameSurface(preset.targetFrameId, frameLabelById)}${pathLabel}`
}

const describeReviewScopeTitle = (reviewScope: SidepanelQuickMoveReviewScope): string => {
  if (!reviewScope.active) {
    return ""
  }

  const contextFragment =
    reviewScope.contextRowCount > 0
      ? reviewScope.contextRowCount === 1
        ? " + 1 context row"
        : ` + ${reviewScope.contextRowCount} context rows`
      : ""

  const matchingLabel =
    reviewScope.matchingRowCount === 1
      ? "1 matching row"
      : `${reviewScope.matchingRowCount} matching rows`

  return `Filtered review scope: ${matchingLabel}${contextFragment}. Commands still target canonical selected rows.`
}

const qualifyQuickMoveTitle = (
  baseTitle: string,
  reviewScope: SidepanelQuickMoveReviewScope,
): string => {
  return reviewScope.active
    ? `${baseTitle} Review scope only — command still targets canonical selected rows.`
    : baseTitle
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
  appendRowTitle(
    presetRow,
    projectedInput,
    projectedInput.reviewScope.active ? "Move selection from review scope:" : "Move selection:",
  )

  appendLastQuickMoveControl(projectedInput, presetRow, renderState)
  appendRecentDestinationControls(projectedInput, presetRow, renderState)
  appendRootMoveControl(projectedInput, presetRow, renderState)

  const rankedTopLevelPresets = rankGroupReparentPresetsByCompatibility(
    projectedInput.destinationProjection.topLevelPresets,
    renderState.frameResolution,
  )

  if (rankedTopLevelPresets.length <= projectedInput.quickPresetInlineMax) {
    appendInlinePresetButtons(projectedInput, presetRow, rankedTopLevelPresets, renderState)
  } else {
    appendPresetDropdown(projectedInput, presetRow, rankedTopLevelPresets, renderState)
  }

  const pickerPresets = rankGroupReparentPresetsByCompatibility(
    buildPickerPresets(
      projectedInput.destinationProjection.allDestinations,
      projectedInput.lastQuickMoveDestination,
      projectedInput.recentQuickMoveDestinations,
    ),
    renderState.frameResolution,
  )

  if (pickerPresets.length > 0) {
    const pickerRow = createControlRow(projectedInput)
    appendRowTitle(
      pickerRow,
      projectedInput,
      projectedInput.reviewScope.active ? "Review destinations:" : "Destination picker:",
    )
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

  if (input.reviewScope.active) {
    title.title = describeReviewScopeTitle(input.reviewScope)
  }

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
    rootButton.title = qualifyQuickMoveTitle(renderState.selectionIssue, input.reviewScope)
  } else {
    rootButton.title = qualifyQuickMoveTitle(
      `Move selection to ${describeRootDestination(
        {
          kind: "root",
          targetFrameId: renderState.frameResolution.frameId,
        },
        input.destinationProjection.frameLabelById,
      )}.`,
      input.reviewScope,
    )
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
    repeatButton.title = qualifyQuickMoveTitle(renderState.selectionIssue, input.reviewScope)
    presetRow.appendChild(repeatButton)
    return
  }

  if (
    lastDestination.kind === "root" &&
    !isRootFrameCompatible(renderState.frameResolution, lastDestination)
  ) {
    repeatButton.disabled = true
    repeatButton.title = qualifyQuickMoveTitle(
      "Last destination is in a different frame.",
      input.reviewScope,
    )
    presetRow.appendChild(repeatButton)
    return
  }

  if (
    lastDestination.kind === "preset" &&
    !isPresetFrameCompatible(renderState.frameResolution, lastDestination.preset)
  ) {
    repeatButton.disabled = true
    repeatButton.title = qualifyQuickMoveTitle(
      "Last destination is in a different frame.",
      input.reviewScope,
    )
    presetRow.appendChild(repeatButton)
    return
  }

  repeatButton.title = qualifyQuickMoveTitle(
    lastDestination.kind === "root"
      ? `Repeat move to ${describeRootDestination(lastDestination, input.destinationProjection.frameLabelById)}.`
      : `Repeat move to ${describePresetDestinationTitle(lastDestination.preset, input.destinationProjection.frameLabelById)}.`,
    input.reviewScope,
  )

  presetRow.appendChild(repeatButton)
}

const appendRecentDestinationControls = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  renderState: SidepanelQuickMoveRenderState,
): void => {
  const recentDestinations = rankQuickMoveDestinationsByCompatibility(
    input.recentQuickMoveDestinations.filter((destination) => {
      const lastDestination = input.lastQuickMoveDestination
      if (!lastDestination) {
        return true
      }

      return !isSameDestination(destination, lastDestination)
    }),
    renderState.frameResolution,
  ).slice(0, RECENT_TARGET_BUTTON_MAX)

  if (recentDestinations.length === 0) {
    return
  }

  const recentLabel = input.ownerDocument.createElement("span")
  recentLabel.textContent = "Recent:"
  recentLabel.style.fontSize = "11px"
  recentLabel.style.opacity = "0.75"

  if (input.reviewScope.active) {
    recentLabel.title = describeReviewScopeTitle(input.reviewScope)
  }

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
      button.title = qualifyQuickMoveTitle(renderState.selectionIssue, input.reviewScope)
      presetRow.appendChild(button)
      continue
    }

    if (!isDestinationFrameCompatible(renderState.frameResolution, destination)) {
      button.disabled = true
      button.title = qualifyQuickMoveTitle(
        "Recent destination is in a different frame.",
        input.reviewScope,
      )
      presetRow.appendChild(button)
      continue
    }

    button.title = qualifyQuickMoveTitle(
      destination.kind === "root"
        ? `Move selection to ${describeRootDestination(destination, input.destinationProjection.frameLabelById)}.`
        : `Move selection to ${describePresetDestinationTitle(destination.preset, input.destinationProjection.frameLabelById)}.`,
      input.reviewScope,
    )

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
      presetButton.title = qualifyQuickMoveTitle(renderState.selectionIssue, input.reviewScope)
    } else if (!isFrameCompatible) {
      presetButton.title = qualifyQuickMoveTitle(
        "Preset is in a different frame than the current selection.",
        input.reviewScope,
      )
    } else {
      presetButton.title = qualifyQuickMoveTitle(
        `Move selection to ${describePresetDestinationTitle(preset, input.destinationProjection.frameLabelById)}.`,
        input.reviewScope,
      )
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
  placeholder.textContent = input.reviewScope.active
    ? `Top-level review destinations (${presets.length})`
    : `Top-level groups (${presets.length})`
  select.appendChild(placeholder)

  let compatibleCount = 0

  for (const preset of presets) {
    const option = input.ownerDocument.createElement("option")
    option.value = preset.key
    option.textContent =
      preset.key === lastPresetKey
        ? `${describePresetDestinationOptionLabel(preset, input.destinationProjection.frameLabelById)} ★`
        : describePresetDestinationOptionLabel(preset, input.destinationProjection.frameLabelById)
    option.title = describePresetDestinationTitle(
      preset,
      input.destinationProjection.frameLabelById,
    )

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
    select.title = qualifyQuickMoveTitle(renderState.selectionIssue, input.reviewScope)
  } else if (compatibleCount === 0) {
    select.disabled = true
    select.title = qualifyQuickMoveTitle(
      "No compatible top-level group presets for this frame.",
      input.reviewScope,
    )
  } else if (input.reviewScope.active) {
    select.title =
      "Review-scope move targets. Labels include frame context while commands still target canonical selected rows."
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
      applyButton.title = qualifyQuickMoveTitle(renderState.selectionIssue, input.reviewScope)
      return
    }

    if (!preset) {
      applyButton.title = qualifyQuickMoveTitle("Choose a destination preset.", input.reviewScope)
      return
    }

    if (!isPresetFrameCompatible(renderState.frameResolution, preset)) {
      applyButton.title = qualifyQuickMoveTitle(
        "Preset is in a different frame than the current selection.",
        input.reviewScope,
      )
      return
    }

    applyButton.title = qualifyQuickMoveTitle(
      `Move selection to ${describePresetDestinationTitle(preset, input.destinationProjection.frameLabelById)}.`,
      input.reviewScope,
    )
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
    ? input.reviewScope.active
      ? `All review destinations (${presets.length} shown, list capped)`
      : `All group destinations (${presets.length} shown, list capped)`
    : input.reviewScope.active
      ? `All review destinations (${presets.length})`
      : `All group destinations (${presets.length})`
  select.appendChild(placeholder)

  let compatibleCount = 0

  for (const preset of presets) {
    const option = input.ownerDocument.createElement("option")
    option.value = preset.key
    option.textContent =
      preset.key === lastPresetKey
        ? `${describePresetDestinationOptionLabel(preset, input.destinationProjection.frameLabelById)} ★`
        : describePresetDestinationOptionLabel(preset, input.destinationProjection.frameLabelById)
    option.title = describePresetDestinationTitle(
      preset,
      input.destinationProjection.frameLabelById,
    )

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
    select.title = qualifyQuickMoveTitle(renderState.selectionIssue, input.reviewScope)
  } else if (compatibleCount === 0) {
    select.disabled = true
    select.title = qualifyQuickMoveTitle(
      "No compatible group destinations for this frame.",
      input.reviewScope,
    )
  } else if (input.reviewScope.active) {
    select.title =
      "Review-scope destination picker. Labels include frame context and canonical path while commands still target canonical selected rows."
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
      applyButton.title = qualifyQuickMoveTitle(renderState.selectionIssue, input.reviewScope)
      return
    }

    if (!preset) {
      applyButton.title = qualifyQuickMoveTitle(
        "Choose a destination from the picker.",
        input.reviewScope,
      )
      return
    }

    if (!isPresetFrameCompatible(renderState.frameResolution, preset)) {
      applyButton.title = qualifyQuickMoveTitle(
        "Destination is in a different frame than the current selection.",
        input.reviewScope,
      )
      return
    }

    applyButton.title = qualifyQuickMoveTitle(
      `Move selection to ${describePresetDestinationTitle(preset, input.destinationProjection.frameLabelById)}.`,
      input.reviewScope,
    )
  }

  select.addEventListener("change", updateApplyState)
  updateApplyState()

  pickerRow.appendChild(select)
  pickerRow.appendChild(applyButton)
}
