const SHORTCUTS = [
  "Keyboard shortcuts",
  "↑/↓ focus rows",
  "Shift+↑/↓ extend row selection",
  "Home/End bounds",
  "PgUp/PgDn page",
  "Shift+PgUp/PgDn extend page",
  "Space select/deselect row",
  "Ctrl+Space toggle row",
  "Shift+Space add range to selection",
  "←/→ collapse/expand",
  "Enter rename",
  "Del delete",
  "Alt+↑/↓ nudge order",
  "Alt+[ / ] out/in group",
  "Alt+0 root",
  "Alt+1..9 pick group",
  "F/B reorder",
  "Shift+F/B front/back",
  "G/U structural",
].join("\n")

/** Owns transient help DOM; survives same-view refresh but never a mount/context reset. */
export class SidepanelKeyboardHelp {
  #elements: { button: HTMLButtonElement; panel: HTMLDivElement } | null = null
  #restoreTarget: HTMLElement | null = null
  #unbind: (() => void) | null = null

  constructor(private readonly id: string) {}

  hasFocus(): boolean {
    return (
      this.#restoreTarget !== null ||
      this.ownsTarget(this.#elements?.button.ownerDocument.activeElement ?? null)
    )
  }

  ownsTarget(target: EventTarget | null): boolean {
    if (!target || !this.#elements) return false
    // Works across owner windows; don't use the ambient realm's instanceof Node.
    const { button, panel } = this.#elements
    return (
      button === target ||
      panel === target ||
      ("nodeType" in target && (button.contains(target as Node) || panel.contains(target as Node)))
    )
  }

  beforeRender(contentRoot: HTMLElement): boolean {
    const active = contentRoot.ownerDocument.activeElement
    this.#restoreTarget =
      active && contentRoot.contains(active) && this.ownsTarget(active)
        ? (active as HTMLElement)
        : null
    return this.#restoreTarget !== null
  }

  restoreFocus(): void {
    const target = this.#restoreTarget
    this.#restoreTarget = null
    if (target && this.ownsTarget(target)) target.focus({ preventScroll: true })
  }

  render(
    ownerDocument: Document,
    createIcon: () => Node,
  ): {
    button: HTMLButtonElement
    panel: HTMLDivElement
  } {
    if (this.#elements?.button.ownerDocument !== ownerDocument) this.reset()
    if (this.#elements) return this.#elements

    const button = ownerDocument.createElement("button")
    button.type = "button"
    button.id = `${this.id}-button`
    button.title = "Keyboard shortcuts"
    button.ariaLabel = "Keyboard shortcuts"
    button.ariaExpanded = "false"
    button.setAttribute("aria-controls", `${this.id}-panel`)
    Object.assign(button.style, {
      minWidth: "24px",
      minHeight: "24px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      border: "none",
      borderRadius: "4px",
      background: "transparent",
      boxShadow: "none",
      color: "var(--text-muted, inherit)",
      cursor: "pointer",
    })
    const icon = ownerDocument.createElement("span")
    icon.ariaHidden = "true"
    icon.appendChild(createIcon())
    button.appendChild(icon)

    const panel = ownerDocument.createElement("div")
    panel.id = `${this.id}-panel`
    panel.role = "region"
    panel.ariaLabel = "Keyboard shortcuts"
    panel.tabIndex = 0
    panel.textContent = SHORTCUTS
    Object.assign(panel.style, {
      display: "none",
      flexBasis: "100%",
      boxSizing: "border-box",
      width: "100%",
      maxHeight: "min(320px, 45vh)",
      overflowY: "auto",
      padding: "8px 10px",
      border: "1px solid var(--background-modifier-border, rgba(120,120,120,0.18))",
      borderRadius: "6px",
      background: "var(--background-primary, #fff)",
      color: "var(--text-normal, inherit)",
      fontSize: "11px",
      lineHeight: "1.45",
      whiteSpace: "pre-line",
    })
    const setExpanded = (expanded: boolean): void => {
      button.ariaExpanded = String(expanded)
      panel.style.display = expanded ? "block" : "none"
    }
    const click = (event: MouseEvent): void => {
      event.stopPropagation()
      setExpanded(button.ariaExpanded !== "true")
    }
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && button.ariaExpanded === "true") {
        event.preventDefault()
        setExpanded(false)
        button.focus({ preventScroll: true })
      }
      // Preserve native button activation, Tab traversal and panel scrolling defaults.
      event.stopPropagation()
    }
    const isolate = (event: Event): void => event.stopPropagation()
    button.addEventListener("click", click)
    const keyTargets: readonly HTMLElement[] = [button, panel]
    for (const element of keyTargets) {
      element.addEventListener("keydown", keydown)
      element.addEventListener("keypress", isolate)
      element.addEventListener("keyup", isolate)
    }
    this.#unbind = () => {
      button.removeEventListener("click", click)
      for (const element of keyTargets) {
        element.removeEventListener("keydown", keydown)
        element.removeEventListener("keypress", isolate)
        element.removeEventListener("keyup", isolate)
      }
    }
    this.#elements = { button, panel }
    return this.#elements
  }

  reset(): void {
    this.#unbind?.()
    this.#elements?.button.remove()
    this.#elements?.panel.remove()
    this.#elements = null
    this.#restoreTarget = null
    this.#unbind = null
  }
}
