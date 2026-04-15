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
  readonly onGroupSelected: () => Promise<void>
  readonly onReorderSelected: (mode: ReorderMode) => Promise<void>
  readonly onUngroupLikeSelection: () => Promise<void>
  readonly onTogglePersistLastMoveAcrossRestarts: (nextPreference: boolean) => Promise<boolean>
  readonly onNotify: (message: string) => void
  readonly onPersistTab: () => boolean
  readonly onCloseTab: () => void
}

const qualifyReviewScopeActionTitle = (baseTitle: string, reviewScopeActive: boolean): string => {
  return reviewScopeActive
    ? `${baseTitle} Review scope does not narrow command targets.`
    : baseTitle
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

  appendPersistenceControl(input, toolbar)
  appendCloseControl(input, toolbar)
  appendLastMovePersistenceControl(input, toolbar)

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
  if (groupButton.disabled) {
    groupButton.title = qualifyReviewScopeActionTitle(
      "Group selected requires at least two selected elements.",
      input.reviewScopeActive,
    )
  } else if (input.reviewScopeActive) {
    groupButton.title = qualifyReviewScopeActionTitle(
      "Group selected acts on canonical selected rows.",
      input.reviewScopeActive,
    )
  }
  toolbar.appendChild(groupButton)

  appendReorderControls(input, toolbar)

  const ungroupLikeButton = createStyledToolbarButton(input, "Ungroup-like", async () => {
    await input.onUngroupLikeSelection()
  })
  ungroupLikeButton.disabled = input.selectedElementCount === 0 || !!input.ungroupLikeIssue
  if (input.ungroupLikeIssue) {
    ungroupLikeButton.title = qualifyReviewScopeActionTitle(
      input.ungroupLikeIssue,
      input.reviewScopeActive,
    )
  } else if (ungroupLikeButton.disabled) {
    ungroupLikeButton.title = qualifyReviewScopeActionTitle(
      "Ungroup-like requires at least one selected element.",
      input.reviewScopeActive,
    )
  } else if (input.reviewScopeActive) {
    ungroupLikeButton.title = qualifyReviewScopeActionTitle(
      "Ungroup-like acts on canonical selected rows.",
      input.reviewScopeActive,
    )
  }
  toolbar.appendChild(ungroupLikeButton)

  return toolbar
}

const appendReorderControls = (input: SidepanelToolbarRenderInput, toolbar: HTMLElement): void => {
  const controls: ReadonlyArray<{
    readonly label: string
    readonly mode: ReorderMode
  }> = [
    {
      label: "Send to back",
      mode: "back",
    },
    {
      label: "Send backward",
      mode: "backward",
    },
    {
      label: "Bring forward",
      mode: "forward",
    },
    {
      label: "Bring to front",
      mode: "front",
    },
  ]

  for (const control of controls) {
    const button = createStyledToolbarButton(input, control.label, async () => {
      await input.onReorderSelected(control.mode)
    })
    button.disabled = input.selectedElementCount === 0
    if (button.disabled) {
      button.title = qualifyReviewScopeActionTitle(
        `${control.label} requires at least one selected row.`,
        input.reviewScopeActive,
      )
    } else if (input.reviewScopeActive) {
      button.title = qualifyReviewScopeActionTitle(
        `${control.label} acts on canonical selected rows.`,
        input.reviewScopeActive,
      )
    }
    toolbar.appendChild(button)
  }
}

const appendLastMovePersistenceControl = (
  input: SidepanelToolbarRenderInput,
  toolbar: HTMLElement,
): void => {
  if (!input.canPersistLastMovePreference) {
    return
  }

  let persistAcrossRestarts = input.persistLastMoveAcrossRestarts

  const label = persistAcrossRestarts ? "Remember last move: on" : "Remember last move: off"

  let toggleInFlight = false

  const toggleButton = createStyledToolbarButton(input, label, async () => {
    if (toggleInFlight) {
      return
    }

    const nextPreference = !persistAcrossRestarts
    toggleInFlight = true
    toggleButton.disabled = true

    const persisted = await input.onTogglePersistLastMoveAcrossRestarts(nextPreference)

    toggleInFlight = false
    toggleButton.disabled = false

    if (!persisted) {
      input.onNotify("Remember-last-move preference did not persist.")
      toggleButton.textContent = persistAcrossRestarts
        ? "Remember last move: on"
        : "Remember last move: off"
      return
    }

    persistAcrossRestarts = nextPreference
    toggleButton.textContent = nextPreference ? "Remember last move: on" : "Remember last move: off"

    if (nextPreference) {
      input.onNotify("Last move destination will persist across restarts.")
      return
    }

    input.onNotify("Last move persistence disabled.")
  })

  toolbar.appendChild(toggleButton)
}

const appendPersistenceControl = (
  input: SidepanelToolbarRenderInput,
  toolbar: HTMLElement,
): void => {
  if (!input.canPersistTab) {
    return
  }

  if (input.didPersistTab) {
    const badge = input.ownerDocument.createElement("span")
    badge.textContent = "Persisted ✓"
    badge.style.fontSize = "11px"
    badge.style.fontWeight = "600"
    badge.style.opacity = "0.78"
    badge.style.padding = "2px 6px"
    badge.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.35))"
    badge.style.borderRadius = "5px"
    badge.style.background = "var(--background-secondary-alt, rgba(120,120,120,0.08))"
    toolbar.appendChild(badge)
    return
  }

  const persistButton = createStyledToolbarButton(input, "Persist tab", async () => {
    const persisted = input.onPersistTab()
    if (!persisted) {
      input.onNotify("Could not persist sidepanel tab.")
      return
    }

    input.onNotify("Layer Manager sidepanel persisted.")
  })

  toolbar.appendChild(persistButton)
}

const appendCloseControl = (input: SidepanelToolbarRenderInput, toolbar: HTMLElement): void => {
  if (!input.canCloseTab) {
    return
  }

  const closeButton = createStyledToolbarButton(input, "Close tab", async () => {
    input.onCloseTab()
  })

  toolbar.appendChild(closeButton)
}
