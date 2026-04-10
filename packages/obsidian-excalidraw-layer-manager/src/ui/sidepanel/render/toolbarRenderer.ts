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

export const renderSidepanelToolbar = (input: SidepanelToolbarRenderInput): HTMLDivElement => {
  const toolbar = input.ownerDocument.createElement("div")
  toolbar.style.display = "flex"
  toolbar.style.flexWrap = "wrap"
  toolbar.style.gap = "4px"
  toolbar.style.marginBottom = "6px"
  input.container.appendChild(toolbar)

  appendPersistenceControl(input, toolbar)
  appendCloseControl(input, toolbar)
  appendLastMovePersistenceControl(input, toolbar)

  if (!input.hasActions) {
    return toolbar
  }

  const groupButton = input.createToolbarButton(input.ownerDocument, "Group selected", async () => {
    await input.onGroupSelected()
  })
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

  const ungroupLikeButton = input.createToolbarButton(
    input.ownerDocument,
    "Ungroup-like",
    async () => {
      await input.onUngroupLikeSelection()
    },
  )
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
    const button = input.createToolbarButton(input.ownerDocument, control.label, async () => {
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

  const toggleButton = input.createToolbarButton(input.ownerDocument, label, async () => {
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
    badge.style.opacity = "0.75"
    badge.style.padding = "2px 6px"
    badge.style.border = "1px solid var(--background-modifier-border, rgba(120,120,120,0.35))"
    badge.style.borderRadius = "4px"
    toolbar.appendChild(badge)
    return
  }

  const persistButton = input.createToolbarButton(input.ownerDocument, "Persist tab", async () => {
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

  const closeButton = input.createToolbarButton(input.ownerDocument, "Close tab", async () => {
    input.onCloseTab()
  })

  toolbar.appendChild(closeButton)
}
