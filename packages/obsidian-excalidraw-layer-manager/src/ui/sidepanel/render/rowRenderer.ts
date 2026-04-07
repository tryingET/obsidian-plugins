import type { LayerNode } from "../../../model/tree.js"
import type { LayerManagerUiActions } from "../../renderer.js"

export interface SidepanelRowVisualState {
  readonly hidden: boolean
  readonly locked: boolean
}

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
  readonly actions: LayerManagerUiActions | undefined
  readonly styleConfig: SidepanelRowStyleConfig
  readonly nodeVisualState: SidepanelRowVisualState
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

export const renderSidepanelRow = (input: SidepanelRowRenderInput): SidepanelRowRenderResult => {
  const row = input.ownerDocument.createElement("div")
  row.style.display = "flex"
  row.style.alignItems = "center"
  row.style.gap = "3px"
  row.style.minHeight = `${input.styleConfig.rowMinHeightPx}px`
  row.style.paddingLeft = `${input.depth * input.styleConfig.indentStepPx}px`
  row.style.borderRadius = "4px"
  row.style.fontSize = `${input.styleConfig.rowFontSizePx}px`
  row.tabIndex = -1

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
  label.style.overflow = "hidden"
  label.style.textOverflow = "ellipsis"
  label.style.whiteSpace = "nowrap"
  label.style.opacity = input.nodeVisualState.hidden ? "0.6" : "1"
  row.appendChild(label)

  return null
}

const appendRowActionButtons = (input: SidepanelRowRenderInput, row: HTMLDivElement): void => {
  const actions = input.actions
  if (!actions) {
    return
  }

  row.appendChild(
    input.createIconActionButton(
      input.ownerDocument,
      {
        iconName: input.nodeVisualState.hidden ? "eye-off" : "eye",
        fallbackLabel: input.nodeVisualState.hidden ? "🙈" : "👁",
        title: input.nodeVisualState.hidden ? "Show layer" : "Hide layer",
      },
      () => actions.toggleVisibilityNode(input.node.id),
    ),
  )

  row.appendChild(
    input.createIconActionButton(
      input.ownerDocument,
      {
        iconName: input.nodeVisualState.locked ? "lock" : "unlock",
        fallbackLabel: input.nodeVisualState.locked ? "🔒" : "🔓",
        title: input.nodeVisualState.locked ? "Unlock layer" : "Lock layer",
      },
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
