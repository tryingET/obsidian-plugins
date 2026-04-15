import type { LayerNode } from "../../../model/tree.js"
import type { LayerManagerUiActions } from "../../renderer.js"
import type { SidepanelFilterMatchKind, SidepanelRowVisualState } from "./rowModel.js"
import {
  type SidepanelRowBadgeDescriptor,
  type SidepanelRowBadgeEmphasis,
  buildSidepanelRowDescriptors,
} from "./rowPresentation.js"

export interface SidepanelInlineRenameRenderState {
  readonly nodeId: string
  readonly draft: string
  readonly shouldAutofocusInput: boolean
}

interface SidepanelRowStyleConfig {
  readonly indentStepPx: number
  readonly rowMinHeightPx: number
  readonly rowFontSizePx: number
  readonly iconButtonSizePx: number
  readonly iconSizePx: number
}

interface SidepanelRowActionIcon {
  readonly iconName: string
  readonly fallbackLabel: string
  readonly title?: string
}

export type SidepanelRowDropHintKind = "reorderBefore" | "reorderAfter" | "reparent"

interface SidepanelRowRenderInput {
  readonly ownerDocument: Document
  readonly rowDomId: string
  readonly node: LayerNode
  readonly depth: number
  readonly selected: boolean
  readonly focused: boolean
  readonly dropHintKind: SidepanelRowDropHintKind | null
  readonly dropHintLabel: string | null
  readonly actions: LayerManagerUiActions | undefined
  readonly styleConfig: SidepanelRowStyleConfig
  readonly nodeVisualState: SidepanelRowVisualState
  readonly filterMatchKind: SidepanelFilterMatchKind
  readonly inlineRenameState: SidepanelInlineRenameRenderState | null
  readonly onToggleExpanded: (nodeId: string) => void
  readonly onInlineRenameDraftChange: (nextDraft: string) => void
  readonly onInlineRenameCommit: (nodeId: string) => void
  readonly onInlineRenameCancel: () => void
  readonly isInlineRenameActiveForNode: (nodeId: string) => boolean
  readonly onRenameNodeFromAction: (nodeId: string, initialValue: string) => void
  readonly createIconActionButton: (
    ownerDocument: Document,
    icon: SidepanelRowActionIcon,
    action: () => Promise<unknown>,
  ) => HTMLButtonElement
}

interface SidepanelRowRenderResult {
  readonly row: HTMLDivElement
  readonly renameInputForAutofocus: HTMLInputElement | null
}

const createMetaBadge = (
  ownerDocument: Document,
  text: string,
  emphasis: SidepanelRowBadgeEmphasis = "default",
): HTMLSpanElement => {
  const badge = ownerDocument.createElement("span")
  badge.textContent = text
  badge.style.display = "inline-flex"
  badge.style.alignItems = "center"
  badge.style.flexShrink = "0"
  badge.style.padding = "0 4px"
  badge.style.borderRadius = "999px"
  badge.style.fontSize = "9px"
  badge.style.lineHeight = "14px"
  badge.style.letterSpacing = "0.01em"

  if (emphasis === "match") {
    badge.style.background = "var(--interactive-accent-hover, rgba(120,120,120,0.2))"
    badge.style.color = "var(--text-normal, inherit)"
    return badge
  }

  if (emphasis === "type") {
    badge.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.12))"
    badge.style.background = "transparent"
    badge.style.color = "var(--text-muted, inherit)"
    return badge
  }

  if (emphasis === "structure") {
    badge.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.12))"
    badge.style.background = "var(--background-secondary-alt, rgba(120,120,120,0.08))"
    badge.style.color = "var(--text-muted, inherit)"
    return badge
  }

  if (emphasis === "visibility") {
    badge.style.background = "var(--background-modifier-hover, rgba(120,120,120,0.12))"
    badge.style.color = "var(--text-muted, inherit)"
    return badge
  }

  if (emphasis === "lock") {
    badge.style.background = "var(--background-secondary-alt, rgba(120,120,120,0.12))"
    badge.style.color = "var(--text-muted, inherit)"
    return badge
  }

  badge.style.background = "var(--background-modifier-border, rgba(120,120,120,0.12))"
  badge.style.color = "var(--text-muted, inherit)"
  return badge
}

const resolveRowShellBoxShadow = (
  state: SidepanelRowVisualState,
  dropHintKind: SidepanelRowDropHintKind | null,
): string => {
  const shadows: string[] = []

  if (state.visibility === "hidden") {
    shadows.push("inset 3px 0 0 0 var(--text-faint, rgba(120,120,120,0.55))")
  } else if (state.visibility === "mixed") {
    shadows.push("inset 3px 0 0 0 var(--background-modifier-border-hover, rgba(120,120,120,0.45))")
  }

  if (state.lock === "locked") {
    shadows.push("inset -3px 0 0 0 var(--text-muted, rgba(120,120,120,0.6))")
  } else if (state.lock === "mixed") {
    shadows.push("inset -3px 0 0 0 var(--background-secondary-alt, rgba(120,120,120,0.45))")
  }

  if (dropHintKind === "reparent") {
    shadows.push("inset 0 0 0 2px var(--interactive-accent, rgba(120,120,120,0.68))")
  }

  if (dropHintKind === "reorderBefore") {
    shadows.push("inset 0 2px 0 0 var(--interactive-accent, rgba(120,120,120,0.7))")
  }

  if (dropHintKind === "reorderAfter") {
    shadows.push("inset 0 -2px 0 0 var(--interactive-accent, rgba(120,120,120,0.7))")
  }

  return shadows.join(", ")
}

const resolveVisibilityActionIcon = (state: SidepanelRowVisualState): SidepanelRowActionIcon => {
  if (state.visibility === "hidden") {
    return {
      iconName: "eye-off",
      fallbackLabel: "🙈",
      title: "Show all items",
    }
  }

  if (state.visibility === "mixed") {
    return {
      iconName: "eye",
      fallbackLabel: "◐",
      title: "Show hidden items",
    }
  }

  return {
    iconName: "eye",
    fallbackLabel: "👁",
    title: "Hide all items",
  }
}

const resolveLockActionIcon = (state: SidepanelRowVisualState): SidepanelRowActionIcon => {
  if (state.lock === "locked") {
    return {
      iconName: "lock",
      fallbackLabel: "🔒",
      title: "Unlock all items",
    }
  }

  if (state.lock === "mixed") {
    return {
      iconName: "lock",
      fallbackLabel: "◪",
      title: "Lock unlocked items",
    }
  }

  return {
    iconName: "unlock",
    fallbackLabel: "🔓",
    title: "Lock all items",
  }
}

export const renderSidepanelRow = (input: SidepanelRowRenderInput): SidepanelRowRenderResult => {
  const rowDescriptors = buildSidepanelRowDescriptors({
    node: input.node,
    nodeVisualState: input.nodeVisualState,
    filterMatchKind: input.filterMatchKind,
  })
  const row = input.ownerDocument.createElement("div")
  row.id = input.rowDomId
  row.role = "treeitem"
  row.style.display = "flex"
  row.style.alignItems = "center"
  row.style.gap = "3px"
  row.style.minHeight = `${input.styleConfig.rowMinHeightPx}px`
  row.style.paddingLeft = `${input.depth * input.styleConfig.indentStepPx}px`
  row.style.paddingRight = "2px"
  row.style.borderRadius = "4px"
  row.style.fontSize = `${input.styleConfig.rowFontSizePx}px`
  row.style.border = "1px solid transparent"
  row.ariaLabel = rowDescriptors.ariaLabel
  row.ariaSelected = input.selected ? "true" : "false"
  row.ariaLevel = `${input.depth + 1}`
  if (input.node.canExpand || input.node.children.length > 0) {
    // Filter projections may intentionally suppress expand/collapse controls while still
    // exposing a descendant subtree directly. Keep the tree hierarchy state truthful to the
    // rendered projection even when the current row is not interactively expandable.
    row.ariaExpanded = input.node.isExpanded ? "true" : "false"
  }
  row.tabIndex = -1

  const rowBoxShadow = resolveRowShellBoxShadow(input.nodeVisualState, input.dropHintKind)
  if (rowBoxShadow.length > 0) {
    row.style.boxShadow = rowBoxShadow
  }

  if (input.filterMatchKind === "self") {
    row.style.background = "var(--background-modifier-hover, rgba(120,120,120,0.12))"
  }

  if (input.selected) {
    row.style.background = "var(--interactive-accent-hover, rgba(120,120,120,0.2))"
  }

  if (input.dropHintKind === "reparent" && !input.selected) {
    row.style.background = "var(--interactive-accent-hover, rgba(120,120,120,0.16))"
    row.style.borderColor = "var(--interactive-accent, rgba(120,120,120,0.68))"
  }

  if (input.focused) {
    row.style.outline = "1px solid var(--interactive-accent, rgba(120,120,120,0.6))"
    row.style.outlineOffset = "-1px"
  }

  if (input.actions) {
    row.style.cursor = "pointer"
  }

  appendExpandControl(input, row, rowDescriptors.expandButtonLabel)

  const renameInputForAutofocus = appendLabelOrRenameInput(
    input,
    row,
    rowDescriptors.typeBadge.text,
  )
  appendMetaBadges(input, row, rowDescriptors.metaBadges)
  appendRowActionButtons(input, row)

  return {
    row,
    renameInputForAutofocus,
  }
}

const appendExpandControl = (
  input: SidepanelRowRenderInput,
  row: HTMLDivElement,
  expandButtonLabel: string | null,
): void => {
  const { node, actions, ownerDocument } = input

  if (node.canExpand && actions) {
    const expandButton = ownerDocument.createElement("button")
    expandButton.type = "button"
    expandButton.textContent = node.isExpanded ? "▾" : "▸"
    expandButton.style.minWidth = `${input.styleConfig.iconButtonSizePx}px`
    expandButton.style.minHeight = `${input.styleConfig.iconButtonSizePx}px`
    expandButton.style.fontSize = `${input.styleConfig.iconSizePx}px`
    expandButton.style.padding = "0"
    expandButton.style.border = "none"
    expandButton.style.background = "transparent"
    expandButton.style.boxShadow = "none"
    if (expandButtonLabel) {
      expandButton.title = expandButtonLabel
      expandButton.ariaLabel = expandButtonLabel
    }
    expandButton.addEventListener("click", (event) => {
      event.stopPropagation()
      input.onToggleExpanded(node.id)
    })
    row.appendChild(expandButton)
    return
  }

  const spacer = ownerDocument.createElement("span")
  spacer.style.display = "inline-block"
  spacer.style.minWidth = `${input.styleConfig.iconButtonSizePx}px`
  row.appendChild(spacer)
}

const appendLabelOrRenameInput = (
  input: SidepanelRowRenderInput,
  row: HTMLDivElement,
  typeBadgeLabel: string,
): HTMLInputElement | null => {
  const inlineRenameState =
    input.inlineRenameState?.nodeId === input.node.id ? input.inlineRenameState : null

  row.appendChild(createMetaBadge(input.ownerDocument, typeBadgeLabel, "type"))

  if (inlineRenameState && input.actions) {
    const renameInput = input.ownerDocument.createElement("input")
    renameInput.type = "text"
    renameInput.value = inlineRenameState.draft
    renameInput.style.flex = "1"
    renameInput.style.fontSize = `${input.styleConfig.rowFontSizePx}px`
    renameInput.style.padding = "1px 3px"
    renameInput.style.minWidth = "0"

    renameInput.addEventListener("click", (event) => {
      event.stopPropagation()
    })

    renameInput.addEventListener("input", () => {
      input.onInlineRenameDraftChange(renameInput.value)
    })

    renameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault()
        event.stopPropagation()
        input.onInlineRenameCommit(input.node.id)
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        input.onInlineRenameCancel()
        return
      }

      event.stopPropagation()
    })

    renameInput.addEventListener("blur", () => {
      if (!input.isInlineRenameActiveForNode(input.node.id)) {
        return
      }

      input.onInlineRenameCommit(input.node.id)
    })

    row.appendChild(renameInput)

    if (inlineRenameState.shouldAutofocusInput) {
      return renameInput
    }

    return null
  }

  const label = input.ownerDocument.createElement("span")
  label.textContent = input.node.label
  label.title = input.node.label
  label.style.flex = "1"
  label.style.minWidth = "0"
  label.style.fontSize = `${input.styleConfig.rowFontSizePx}px`
  label.style.color = "var(--text-normal, inherit)"
  label.style.fontWeight = input.filterMatchKind === "self" ? "600" : "500"
  label.style.overflow = "hidden"
  label.style.textOverflow = "ellipsis"
  label.style.whiteSpace = "nowrap"
  label.style.opacity =
    input.nodeVisualState.visibility === "hidden"
      ? "0.6"
      : input.nodeVisualState.visibility === "mixed"
        ? "0.85"
        : "1"
  label.style.textDecoration =
    input.nodeVisualState.visibility === "hidden" ? "line-through" : "none"
  row.appendChild(label)

  return null
}

const appendMetaBadges = (
  input: SidepanelRowRenderInput,
  row: HTMLDivElement,
  metaBadges: readonly SidepanelRowBadgeDescriptor[],
): void => {
  const metaHost = input.ownerDocument.createElement("div")
  metaHost.style.display = "inline-flex"
  metaHost.style.alignItems = "center"
  metaHost.style.flexWrap = "wrap"
  metaHost.style.gap = "3px"

  let didAppendDropHint = false
  const appendDropHintBadge = (): void => {
    if (!input.dropHintKind || didAppendDropHint) {
      return
    }

    metaHost.appendChild(
      createMetaBadge(
        input.ownerDocument,
        input.dropHintLabel ?? "drop target",
        input.dropHintKind === "reparent" ? "structure" : "match",
      ),
    )
    didAppendDropHint = true
  }

  for (const badge of metaBadges) {
    if (!didAppendDropHint && badge.emphasis !== "structure" && badge.emphasis !== "default") {
      appendDropHintBadge()
    }

    metaHost.appendChild(createMetaBadge(input.ownerDocument, badge.text, badge.emphasis))
  }

  appendDropHintBadge()

  if (metaHost.children.length === 0) {
    return
  }

  row.appendChild(metaHost)
}

const appendRowActionButtons = (input: SidepanelRowRenderInput, row: HTMLDivElement): void => {
  const actions = input.actions
  if (!actions) {
    return
  }

  row.appendChild(
    input.createIconActionButton(
      input.ownerDocument,
      resolveVisibilityActionIcon(input.nodeVisualState),
      () => actions.toggleVisibilityNode(input.node.id),
    ),
  )

  row.appendChild(
    input.createIconActionButton(
      input.ownerDocument,
      resolveLockActionIcon(input.nodeVisualState),
      () => actions.toggleLockNode(input.node.id),
    ),
  )

  row.appendChild(
    input.createIconActionButton(
      input.ownerDocument,
      {
        iconName: "edit-3",
        fallbackLabel: "✎",
        title: "Rename layer",
      },
      async () => {
        input.onRenameNodeFromAction(input.node.id, input.node.label)
      },
    ),
  )

  row.appendChild(
    input.createIconActionButton(
      input.ownerDocument,
      {
        iconName: "trash-2",
        fallbackLabel: "🗑",
        title: "Delete layer",
      },
      () => actions.deleteNode(input.node.id),
    ),
  )
}
