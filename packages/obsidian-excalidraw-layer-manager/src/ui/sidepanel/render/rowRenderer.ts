import type { LayerNode } from "../../../model/tree.js"
import type { LayerManagerUiActions } from "../../renderer.js"
import type { SidepanelFilterMatchKind, SidepanelRowVisualState } from "./rowModel.js"

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

interface SidepanelRowRenderInput {
  readonly ownerDocument: Document
  readonly node: LayerNode
  readonly depth: number
  readonly selected: boolean
  readonly focused: boolean
  readonly dropHinted: boolean
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
  emphasis: "default" | "match" = "default",
): HTMLSpanElement => {
  const badge = ownerDocument.createElement("span")
  badge.textContent = text
  badge.style.display = "inline-flex"
  badge.style.alignItems = "center"
  badge.style.padding = "0 5px"
  badge.style.borderRadius = "999px"
  badge.style.fontSize = "10px"
  badge.style.lineHeight = "16px"

  if (emphasis === "match") {
    badge.style.background = "var(--interactive-accent-hover, rgba(120,120,120,0.2))"
    badge.style.color = "var(--text-normal, inherit)"
    return badge
  }

  badge.style.background = "var(--background-modifier-border, rgba(120,120,120,0.12))"
  badge.style.color = "var(--text-muted, inherit)"
  return badge
}

const resolveCountBadgeLabel = (node: LayerNode): string | null => {
  if (node.type === "freedrawBucket") {
    return `${node.elementIds.length} strokes`
  }

  if (node.type === "group" || node.type === "frame") {
    return `${node.elementIds.length} items`
  }

  if (node.elementIds.length > 1) {
    return `${node.elementIds.length} linked`
  }

  return null
}

const resolveVisibilityActionIcon = (state: SidepanelRowVisualState): SidepanelRowActionIcon => {
  if (state.visibility === "hidden") {
    return {
      iconName: "eye-off",
      fallbackLabel: "🙈",
      title: "Show layer",
    }
  }

  if (state.visibility === "mixed") {
    return {
      iconName: "eye",
      fallbackLabel: "◐",
      title: "Show all items",
    }
  }

  return {
    iconName: "eye",
    fallbackLabel: "👁",
    title: "Hide layer",
  }
}

const resolveLockActionIcon = (state: SidepanelRowVisualState): SidepanelRowActionIcon => {
  if (state.lock === "locked") {
    return {
      iconName: "lock",
      fallbackLabel: "🔒",
      title: "Unlock layer",
    }
  }

  if (state.lock === "mixed") {
    return {
      iconName: "lock",
      fallbackLabel: "◪",
      title: "Lock all items",
    }
  }

  return {
    iconName: "unlock",
    fallbackLabel: "🔓",
    title: "Lock layer",
  }
}

export const renderSidepanelRow = (input: SidepanelRowRenderInput): SidepanelRowRenderResult => {
  const row = input.ownerDocument.createElement("div")
  row.style.display = "flex"
  row.style.alignItems = "center"
  row.style.gap = "4px"
  row.style.minHeight = `${input.styleConfig.rowMinHeightPx}px`
  row.style.paddingLeft = `${input.depth * input.styleConfig.indentStepPx}px`
  row.style.paddingRight = "4px"
  row.style.borderRadius = "4px"
  row.style.fontSize = `${input.styleConfig.rowFontSizePx}px`
  row.tabIndex = -1

  if (input.filterMatchKind === "self") {
    row.style.background = "var(--background-modifier-hover, rgba(120,120,120,0.12))"
  }

  if (input.selected) {
    row.style.background = "var(--interactive-accent-hover, rgba(120,120,120,0.2))"
  }

  if (input.focused) {
    row.style.outline = "1px solid var(--interactive-accent, rgba(120,120,120,0.6))"
    row.style.outlineOffset = "-1px"
  }

  if (input.dropHinted) {
    row.style.boxShadow = "inset 0 0 0 1px var(--interactive-accent, rgba(120,120,120,0.6))"
  }

  if (input.actions) {
    row.style.cursor = "pointer"
  }

  appendExpandControl(input, row)

  const renameInputForAutofocus = appendLabelOrRenameInput(input, row)
  appendMetaBadges(input, row)
  appendRowActionButtons(input, row)

  return {
    row,
    renameInputForAutofocus,
  }
}

const appendExpandControl = (input: SidepanelRowRenderInput, row: HTMLDivElement): void => {
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
): HTMLInputElement | null => {
  const inlineRenameState =
    input.inlineRenameState?.nodeId === input.node.id ? input.inlineRenameState : null

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
  label.textContent = `[${input.node.type}] ${input.node.label}`
  label.style.flex = "1"
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

const appendMetaBadges = (input: SidepanelRowRenderInput, row: HTMLDivElement): void => {
  const metaHost = input.ownerDocument.createElement("div")
  metaHost.style.display = "inline-flex"
  metaHost.style.alignItems = "center"
  metaHost.style.flexWrap = "wrap"
  metaHost.style.gap = "4px"

  const countBadgeLabel = resolveCountBadgeLabel(input.node)
  if (countBadgeLabel) {
    metaHost.appendChild(createMetaBadge(input.ownerDocument, countBadgeLabel))
  }

  if (input.dropHinted) {
    metaHost.appendChild(
      createMetaBadge(input.ownerDocument, input.dropHintLabel ?? "drop target", "match"),
    )
  }

  if (input.filterMatchKind === "self") {
    metaHost.appendChild(createMetaBadge(input.ownerDocument, "match", "match"))
  } else if (input.filterMatchKind === "descendant") {
    metaHost.appendChild(createMetaBadge(input.ownerDocument, "contains match", "match"))
  }

  if (input.nodeVisualState.visibility === "hidden") {
    metaHost.appendChild(createMetaBadge(input.ownerDocument, "hidden"))
  } else if (input.nodeVisualState.visibility === "mixed") {
    metaHost.appendChild(createMetaBadge(input.ownerDocument, "mixed hidden"))
  }

  if (input.nodeVisualState.lock === "locked") {
    metaHost.appendChild(createMetaBadge(input.ownerDocument, "locked"))
  } else if (input.nodeVisualState.lock === "mixed") {
    metaHost.appendChild(createMetaBadge(input.ownerDocument, "mixed lock"))
  }

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
