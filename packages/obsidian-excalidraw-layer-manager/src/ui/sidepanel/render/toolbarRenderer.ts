interface SidepanelToolbarRenderInput {
  readonly container: HTMLElement
  readonly ownerDocument: Document
  readonly hasActions: boolean
  readonly selectedElementCount: number
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
  readonly onBringSelectedToFront: () => Promise<void>
  readonly onReparentSelected: () => Promise<void>
  readonly onUngroupLikeSelection: () => Promise<void>
  readonly onTogglePersistLastMoveAcrossRestarts: (nextPreference: boolean) => void
  readonly onNotify: (message: string) => void
  readonly onPersistTab: () => boolean
  readonly onCloseTab: () => void
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
  toolbar.appendChild(groupButton)

  const reorderButton = input.createToolbarButton(
    input.ownerDocument,
    "Bring selected to front",
    async () => {
      await input.onBringSelectedToFront()
    },
  )
  reorderButton.disabled = input.selectedElementCount === 0
  toolbar.appendChild(reorderButton)

  const reparentButton = input.createToolbarButton(
    input.ownerDocument,
    "Reparent selected",
    async () => {
      await input.onReparentSelected()
    },
  )
  reparentButton.disabled = input.selectedElementCount === 0
  toolbar.appendChild(reparentButton)

  const ungroupLikeButton = input.createToolbarButton(
    input.ownerDocument,
    "Ungroup-like",
    async () => {
      await input.onUngroupLikeSelection()
    },
  )
  ungroupLikeButton.disabled = input.selectedElementCount === 0
  toolbar.appendChild(ungroupLikeButton)

  return toolbar
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

  const toggleButton = input.createToolbarButton(input.ownerDocument, label, async () => {
    const nextPreference = !persistAcrossRestarts
    input.onTogglePersistLastMoveAcrossRestarts(nextPreference)
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
