import type { ReorderMode } from "../../../commands/reorderNode.js"

interface SidepanelToolbarRenderInput {
  readonly container: HTMLElement
  readonly ownerDocument: Document
  readonly hasActions: boolean
  readonly selectedElementCount: number
  readonly reviewScopeActive: boolean
  readonly ungroupLikeIssue: string | null
  readonly canPersistTab: boolean
  readonly didPersistTab: boolean
  readonly canCloseTab: boolean
  readonly canPersistLastMovePreference: boolean
  readonly persistLastMoveAcrossRestarts: boolean
  readonly createToolbarButton: (
    ownerDocument: Document,
    label: string,
    action: () => Promise<unknown>,
  ) => HTMLButtonElement
  readonly createToolbarIconButton: (
    ownerDocument: Document,
    icon: {
      readonly iconName: string
      readonly fallbackLabel: string
      readonly title?: string
    },
    action: () => Promise<unknown>,
  ) => HTMLButtonElement
  readonly onGroupSelected: () => Promise<void>
  readonly onReorderSelected: (mode: ReorderMode) => Promise<void>
  readonly onUngroupLikeSelection: () => Promise<void>
  readonly onTogglePersistLastMoveAcrossRestarts: (nextPreference: boolean) => Promise<boolean>
  readonly onNotify: (message: string) => void
  readonly onPersistTab: () => boolean
  readonly onCloseTab: () => void
}

const styleToolbarButton = (button: HTMLButtonElement, tone: "neutral" | "primary" = "neutral") => {
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

const createStyledToolbarButton = (
  input: SidepanelToolbarRenderInput,
  label: string,
  action: () => Promise<unknown>,
  tone: "neutral" | "primary" = "neutral",
): HTMLButtonElement => {
  const button = input.createToolbarButton(input.ownerDocument, label, action)
  styleToolbarButton(button, tone)
  return button
}

const createStyledToolbarIconButton = (
  input: SidepanelToolbarRenderInput,
  icon: {
    readonly iconName: string
    readonly fallbackLabel: string
    readonly title?: string
  },
  action: () => Promise<unknown>,
  tone: "neutral" | "primary" = "neutral",
): HTMLButtonElement => {
  const button = input.createToolbarIconButton(input.ownerDocument, icon, action)
  styleToolbarButton(button, tone)
  button.style.display = "inline-flex"
  button.style.alignItems = "center"
  button.style.justifyContent = "center"
  button.style.minWidth = "24px"
  button.style.padding = "2px 6px"
  return button
}

export const renderSidepanelToolbar = (input: SidepanelToolbarRenderInput): HTMLDivElement => {
  const toolbar = input.ownerDocument.createElement("div")
  toolbar.style.display = "flex"
  toolbar.style.flexWrap = "wrap"
  toolbar.style.gap = "4px"
  toolbar.style.marginBottom = "6px"
  toolbar.style.padding = "4px 6px"
  toolbar.style.borderRadius = "6px"
  toolbar.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.16))"
  toolbar.style.background = "var(--background-primary-alt, rgba(120,120,120,0.04))"
  input.container.appendChild(toolbar)

  if (!input.hasActions) {
    return toolbar
  }

  const groupButton = createStyledToolbarButton(
    input,
    "Group selected",
    async () => {
      await input.onGroupSelected()
    },
    "primary",
  )
  groupButton.disabled = input.selectedElementCount < 2
  toolbar.appendChild(groupButton)

  appendReorderControls(input, toolbar)

  const moveOutOfGroupButton = createStyledToolbarButton(input, "Move out of group", async () => {
    await input.onUngroupLikeSelection()
  })
  moveOutOfGroupButton.disabled = input.selectedElementCount === 0 || !!input.ungroupLikeIssue
  toolbar.appendChild(moveOutOfGroupButton)

  return toolbar
}
const appendReorderControls = (input: SidepanelToolbarRenderInput, toolbar: HTMLElement): void => {
  const controls: ReadonlyArray<{
    readonly label: string
    readonly mode: ReorderMode
    readonly iconName: string
    readonly fallbackLabel: string
  }> = [
    {
      label: "Send to back",
      mode: "back",
      iconName: "zindex-send-to-back",
      fallbackLabel: "⇊",
    },
    {
      label: "Send backward",
      mode: "backward",
      iconName: "zindex-send-backward",
      fallbackLabel: "↓",
    },
    {
      label: "Bring forward",
      mode: "forward",
      iconName: "zindex-bring-forward",
      fallbackLabel: "↑",
    },
    {
      label: "Bring to front",
      mode: "front",
      iconName: "zindex-bring-to-front",
      fallbackLabel: "⇈",
    },
  ]

  for (const control of controls) {
    const button = createStyledToolbarIconButton(
      input,
      {
        iconName: control.iconName,
        fallbackLabel: control.fallbackLabel,
        title: control.label,
      },
      async () => {
        await input.onReorderSelected(control.mode)
      },
    )
    button.disabled = input.selectedElementCount === 0
    toolbar.appendChild(button)
  }
}
