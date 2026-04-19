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
  readonly showShortcutHints?: boolean
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

interface QuickMoveShortcutTarget {
  readonly digit: number
  readonly destination: LastQuickMoveDestination
}

interface QuickMoveShortcutResolutionInput {
  readonly frameResolution: SharedFrameResolution
  readonly topLevelPresets: readonly GroupReparentPreset[]
  readonly lastQuickMoveDestination: LastQuickMoveDestination | null
  readonly recentQuickMoveDestinations: readonly LastQuickMoveDestination[]
  readonly quickPresetInlineMax: number
}

const RECENT_TARGET_BUTTON_MAX = 2
const QUICK_MOVE_SHORTCUT_LIMIT = 10

const styleQuickMoveButton = (
  button: HTMLButtonElement,
  tone: "neutral" | "primary" = "neutral",
): void => {
  button.style.position = "relative"
  button.style.fontSize = "11px"
  button.style.lineHeight = "1.2"
  button.style.minHeight = "20px"
  button.style.padding = "2px 7px"
  button.style.borderRadius = "5px"
  button.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.18))"
  button.style.boxShadow = "none"
  button.style.background =
    tone === "primary"
      ? "var(--background-secondary-alt, rgba(120,120,120,0.1))"
      : "var(--background-primary-alt, rgba(120,120,120,0.04))"
}

const styleQuickMoveSelect = (select: HTMLSelectElement, maxWidthPx: number): void => {
  select.style.fontSize = "11px"
  select.style.minHeight = "20px"
  select.style.padding = "1px 4px"
  select.style.maxWidth = `${maxWidthPx}px`
  select.style.borderRadius = "5px"
  select.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.18))"
  select.style.boxShadow = "none"
  select.style.background = "var(--background-primary, transparent)"
}

const createQuickMoveButton = (
  input: SidepanelQuickMoveRenderInput,
  label: string,
  action: () => Promise<unknown>,
  tone: "neutral" | "primary" = "neutral",
): HTMLButtonElement => {
  const button = input.createToolbarButton(input.ownerDocument, label, action)
  styleQuickMoveButton(button, tone)
  return button
}

const toQuickMoveDestinationKey = (destination: LastQuickMoveDestination): string => {
  return destination.kind === "root"
    ? `root:${destination.targetFrameId ?? "canvas"}`
    : `preset:${destination.preset.key}`
}

const appendUniqueQuickMoveDestination = (
  target: LastQuickMoveDestination[],
  seenKeys: Set<string>,
  destination: LastQuickMoveDestination,
): void => {
  const destinationKey = toQuickMoveDestinationKey(destination)
  if (seenKeys.has(destinationKey)) {
    return
  }

  seenKeys.add(destinationKey)
  target.push(destination)
}

export const resolveQuickMoveShortcutTargets = (
  input: QuickMoveShortcutResolutionInput,
): readonly QuickMoveShortcutTarget[] => {
  const rankedTopLevelPresets = rankGroupReparentPresetsByCompatibility(
    input.topLevelPresets,
    input.frameResolution,
  )
  const inlinePresets =
    rankedTopLevelPresets.length <= input.quickPresetInlineMax ? rankedTopLevelPresets : []
  const recentPresetDestinations = rankQuickMoveDestinationsByCompatibility(
    input.recentQuickMoveDestinations
      .filter(
        (destination): destination is Extract<LastQuickMoveDestination, { kind: "preset" }> => {
          return destination.kind === "preset"
        },
      )
      .filter((destination) => {
        const lastDestination = input.lastQuickMoveDestination
        if (!lastDestination || lastDestination.kind !== "preset") {
          return true
        }

        return !isSameDestination(destination, lastDestination)
      }),
    input.frameResolution,
  ).slice(0, RECENT_TARGET_BUTTON_MAX)

  const destinations: LastQuickMoveDestination[] = []
  const seenKeys = new Set<string>()

  appendUniqueQuickMoveDestination(destinations, seenKeys, {
    kind: "root",
    targetFrameId: input.frameResolution.frameId,
  })

  if (input.lastQuickMoveDestination?.kind === "preset") {
    appendUniqueQuickMoveDestination(destinations, seenKeys, input.lastQuickMoveDestination)
  }

  for (const destination of recentPresetDestinations) {
    appendUniqueQuickMoveDestination(destinations, seenKeys, destination)
  }

  for (const preset of inlinePresets) {
    appendUniqueQuickMoveDestination(destinations, seenKeys, {
      kind: "preset",
      preset,
    })
  }

  return destinations.slice(0, QUICK_MOVE_SHORTCUT_LIMIT).map((destination, index) => ({
    digit: index,
    destination,
  }))
}

const resolveQuickMoveShortcutDigit = (
  targets: readonly QuickMoveShortcutTarget[],
  destination: LastQuickMoveDestination,
): number | null => {
  return targets.find((target) => isSameDestination(target.destination, destination))?.digit ?? null
}

const appendShortcutBadge = (button: HTMLButtonElement, digit: number): void => {
  const badge = button.ownerDocument.createElement("span")
  badge.textContent = `${digit}`
  badge.ariaHidden = "true"
  badge.style.position = "absolute"
  badge.style.top = "-5px"
  badge.style.right = "-5px"
  badge.style.display = "inline-flex"
  badge.style.alignItems = "center"
  badge.style.justifyContent = "center"
  badge.style.minWidth = "12px"
  badge.style.height = "12px"
  badge.style.padding = "0 2px"
  badge.style.borderRadius = "999px"
  badge.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.28))"
  badge.style.background = "var(--background-primary, rgba(24,24,24,0.95))"
  badge.style.color = "var(--text-muted, inherit)"
  badge.style.fontSize = "8px"
  badge.style.fontWeight = "700"
  badge.style.lineHeight = "1"
  badge.style.pointerEvents = "none"
  button.appendChild(badge)
}

const decorateQuickMoveButtonWithShortcut = (
  input: SidepanelQuickMoveRenderInput,
  button: HTMLButtonElement,
  targets: readonly QuickMoveShortcutTarget[],
  destination: LastQuickMoveDestination,
): void => {
  const digit = resolveQuickMoveShortcutDigit(targets, destination)
  if (digit === null) {
    return
  }
  ;(
    button as HTMLButtonElement & { __lmxQuickMoveShortcutDigit?: number }
  ).__lmxQuickMoveShortcutDigit = digit

  if (!input.showShortcutHints) {
    return
  }

  appendShortcutBadge(button, digit)
}

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

  const rankedTopLevelPresets = rankGroupReparentPresetsByCompatibility(
    projectedInput.destinationProjection.topLevelPresets,
    renderState.frameResolution,
  )
  const shortcutTargets = resolveQuickMoveShortcutTargets({
    frameResolution: renderState.frameResolution,
    topLevelPresets: projectedInput.destinationProjection.topLevelPresets,
    lastQuickMoveDestination: projectedInput.lastQuickMoveDestination,
    recentQuickMoveDestinations: projectedInput.recentQuickMoveDestinations,
    quickPresetInlineMax: projectedInput.quickPresetInlineMax,
  })

  appendLastQuickMoveControl(projectedInput, presetRow, renderState, shortcutTargets)
  appendRecentDestinationControls(projectedInput, presetRow, renderState, shortcutTargets)
  appendRootMoveControl(projectedInput, presetRow, renderState, shortcutTargets)

  if (rankedTopLevelPresets.length <= projectedInput.quickPresetInlineMax) {
    appendInlinePresetButtons(
      projectedInput,
      presetRow,
      rankedTopLevelPresets,
      renderState,
      shortcutTargets,
    )
  } else {
    appendPresetDropdown(projectedInput, presetRow, rankedTopLevelPresets, renderState)
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
  row.style.padding = "4px 6px"
  row.style.borderRadius = "6px"
  row.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.16))"
  row.style.background = "var(--background-primary-alt, rgba(120,120,120,0.04))"
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
  title.style.fontWeight = "600"
  title.style.opacity = "0.75"
  title.style.paddingRight = "2px"

  row.appendChild(title)
}

const appendRootMoveControl = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  renderState: SidepanelQuickMoveRenderState,
  shortcutTargets: readonly QuickMoveShortcutTarget[],
): void => {
  const rootLabel =
    renderState.hasSelection &&
    input.lastQuickMoveDestination?.kind === "root" &&
    isRootFrameCompatible(renderState.frameResolution, input.lastQuickMoveDestination)
      ? "Root ★"
      : "Root"
  const rootButton = createQuickMoveButton(input, rootLabel, async () => {
    await input.onMoveSelectionToRoot(renderState.frameResolution.frameId)
  })

  rootButton.disabled = !!renderState.selectionIssue

  const rootDestination: LastQuickMoveDestination = {
    kind: "root",
    targetFrameId: renderState.frameResolution.frameId,
  }

  decorateQuickMoveButtonWithShortcut(input, rootButton, shortcutTargets, rootDestination)
  presetRow.appendChild(rootButton)
}

const appendLastQuickMoveControl = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  renderState: SidepanelQuickMoveRenderState,
  shortcutTargets: readonly QuickMoveShortcutTarget[],
): void => {
  const lastDestination = input.lastQuickMoveDestination
  if (!lastDestination) {
    return
  }

  const label =
    lastDestination.kind === "root"
      ? `↺ Last: ${describeRootDestination(lastDestination, input.destinationProjection.frameLabelById)}`
      : `↺ Last: ${lastDestination.preset.label}`

  const repeatButton = createQuickMoveButton(
    input,
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
    presetRow.appendChild(repeatButton)
    return
  }

  if (
    lastDestination.kind === "root" &&
    !isRootFrameCompatible(renderState.frameResolution, lastDestination)
  ) {
    repeatButton.disabled = true
    presetRow.appendChild(repeatButton)
    return
  }

  if (
    lastDestination.kind === "preset" &&
    !isPresetFrameCompatible(renderState.frameResolution, lastDestination.preset)
  ) {
    repeatButton.disabled = true
    presetRow.appendChild(repeatButton)
    return
  }

  decorateQuickMoveButtonWithShortcut(input, repeatButton, shortcutTargets, lastDestination)
  presetRow.appendChild(repeatButton)
}

const appendRecentDestinationControls = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  renderState: SidepanelQuickMoveRenderState,
  shortcutTargets: readonly QuickMoveShortcutTarget[],
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

  presetRow.appendChild(recentLabel)

  for (const destination of recentDestinations) {
    const buttonLabel =
      destination.kind === "root"
        ? describeRootDestination(destination, input.destinationProjection.frameLabelById)
        : truncateLabel(destination.preset.label, input.lastMoveLabelMax)

    const button = createQuickMoveButton(input, buttonLabel, async () => {
      if (destination.kind === "root") {
        await input.onMoveSelectionToRoot(destination.targetFrameId)
        return
      }

      await input.onApplyGroupPreset(destination.preset)
    })

    if (renderState.selectionIssue) {
      button.disabled = true
      presetRow.appendChild(button)
      continue
    }

    if (!isDestinationFrameCompatible(renderState.frameResolution, destination)) {
      button.disabled = true
      presetRow.appendChild(button)
      continue
    }

    decorateQuickMoveButtonWithShortcut(input, button, shortcutTargets, destination)
    presetRow.appendChild(button)
  }
}

const appendInlinePresetButtons = (
  input: SidepanelQuickMoveRenderInput,
  presetRow: HTMLElement,
  presets: readonly GroupReparentPreset[],
  renderState: SidepanelQuickMoveRenderState,
  shortcutTargets: readonly QuickMoveShortcutTarget[],
): void => {
  for (const preset of presets) {
    const lastDestination = input.lastQuickMoveDestination
    const isLastPreset =
      lastDestination?.kind === "preset" && lastDestination.preset.key === preset.key

    const presetLabel = isLastPreset ? `${preset.label} ★` : preset.label
    const presetButton = createQuickMoveButton(input, presetLabel, async () => {
      await input.onApplyGroupPreset(preset)
    })

    const isFrameCompatible = isPresetFrameCompatible(renderState.frameResolution, preset)
    presetButton.disabled = !!renderState.selectionIssue || !isFrameCompatible

    decorateQuickMoveButtonWithShortcut(input, presetButton, shortcutTargets, {
      kind: "preset",
      preset,
    })
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
  styleQuickMoveSelect(select, 180)

  const placeholder = input.ownerDocument.createElement("option")
  placeholder.value = ""
  placeholder.textContent = input.reviewScope.active
    ? `More review destinations (${presets.length})`
    : `More groups (${presets.length})`
  select.appendChild(placeholder)

  let compatibleCount = 0

  for (const preset of presets) {
    const option = input.ownerDocument.createElement("option")
    option.value = preset.key
    option.textContent =
      preset.key === lastPresetKey
        ? `${describePresetDestinationOptionLabel(preset, input.destinationProjection.frameLabelById)} ★`
        : describePresetDestinationOptionLabel(preset, input.destinationProjection.frameLabelById)
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

  if (renderState.selectionIssue || compatibleCount === 0) {
    select.disabled = true
  }

  const applyButton = createQuickMoveButton(
    input,
    "Move",
    async () => {
      const selectedKey = select.value
      const preset = presetByKey.get(selectedKey)

      if (!preset) {
        input.onNotify("Choose a top-level group preset first.")
        return
      }

      await input.onApplyGroupPreset(preset)
    },
    "primary",
  )

  const updateApplyState = (): void => {
    const selectedKey = select.value
    const preset = presetByKey.get(selectedKey)

    const canApply =
      !!preset &&
      !renderState.selectionIssue &&
      isPresetFrameCompatible(renderState.frameResolution, preset)

    applyButton.disabled = !canApply

    if (renderState.selectionIssue) {
      return
    }

    if (!preset) {
      return
    }

    if (!isPresetFrameCompatible(renderState.frameResolution, preset)) {
      return
    }
  }

  select.addEventListener("change", updateApplyState)
  updateApplyState()

  presetRow.appendChild(select)
  presetRow.appendChild(applyButton)
}
