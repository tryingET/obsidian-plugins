import { describe, expect, it, vi } from "vitest"

import { renderSidepanelToolbar } from "../src/ui/sidepanel/render/toolbarRenderer.js"

class FakeDomEvent {
  readonly type: string
  defaultPrevented = false
  propagationStopped = false
  target: EventTarget | null = null

  constructor(type: string) {
    this.type = type
  }

  preventDefault(): void {
    this.defaultPrevented = true
  }

  stopPropagation(): void {
    this.propagationStopped = true
  }
}

class FakeDomElement {
  readonly tagName: string
  readonly ownerDocument: FakeDocument
  readonly style: Record<string, string> = {}

  textContent: string | null = ""
  disabled = false
  title = ""
  value = ""
  parentElement: FakeDomElement | null = null

  #children: FakeDomElement[] = []
  #listeners = new Map<string, Set<(event: FakeDomEvent) => void>>()

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
  }

  get children(): readonly FakeDomElement[] {
    return this.#children
  }

  appendChild(child: FakeDomElement): FakeDomElement {
    child.parentElement = this
    this.#children.push(child)
    return child
  }

  addEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set())
    }

    this.#listeners.get(type)?.add(listener)
  }

  dispatchEvent(event: FakeDomEvent): boolean {
    if (!event.target) {
      event.target = this as unknown as EventTarget
    }

    const listeners = this.#listeners.get(event.type)
    if (!listeners) {
      return !event.defaultPrevented
    }

    for (const listener of [...listeners]) {
      listener(event)
      if (event.propagationStopped) {
        break
      }
    }

    return !event.defaultPrevented
  }

  click(): void {
    if (this.disabled) {
      return
    }

    this.dispatchEvent(new FakeDomEvent("click"))
  }
}

class FakeDocument {
  createElement(tagName: string): FakeDomElement {
    return new FakeDomElement(tagName, this)
  }
}

const flattenElements = (root: FakeDomElement): FakeDomElement[] => {
  const all: FakeDomElement[] = []

  const walk = (element: FakeDomElement): void => {
    all.push(element)

    for (const child of element.children) {
      walk(child)
    }
  }

  walk(root)
  return all
}

const findButtonByText = (root: FakeDomElement, label: string): FakeDomElement | undefined => {
  return flattenElements(root).find(
    (element) => element.tagName === "BUTTON" && element.textContent === label,
  )
}

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe("sidepanel toolbar renderer", () => {
  it("renders toolbar controls and routes action callbacks", async () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    const onGroupSelected = vi.fn(async () => {})
    const onReorderSelected = vi.fn(async (_mode: string) => {})
    const onUngroupLikeSelection = vi.fn(async () => {})
    const onTogglePersistLastMoveAcrossRestarts = vi.fn<
      (nextPreference: boolean) => Promise<boolean>
    >(async () => true)
    const onNotify = vi.fn<(message: string) => void>()
    const onPersistTab = vi.fn(() => true)
    const onCloseTab = vi.fn<() => void>()

    renderSidepanelToolbar({
      container: container as unknown as HTMLElement,
      ownerDocument: document as unknown as Document,
      hasActions: true,
      selectedElementCount: 2,
      canPersistTab: true,
      didPersistTab: false,
      canCloseTab: true,
      canPersistLastMovePreference: true,
      persistLastMoveAcrossRestarts: false,
      createToolbarButton: (ownerDocument, label, action): HTMLButtonElement => {
        const button = (ownerDocument as unknown as FakeDocument).createElement("button")
        button.textContent = label
        button.addEventListener("click", () => {
          void action()
        })
        return button as unknown as HTMLButtonElement
      },
      onGroupSelected,
      onReorderSelected,
      onUngroupLikeSelection,
      onTogglePersistLastMoveAcrossRestarts,
      onNotify,
      onPersistTab,
      onCloseTab,
    })

    const renderedContainer = container as unknown as FakeDomElement

    const persistButton = findButtonByText(renderedContainer, "Persist tab")
    const closeButton = findButtonByText(renderedContainer, "Close tab")
    const rememberButton = findButtonByText(renderedContainer, "Remember last move: off")
    const groupButton = findButtonByText(renderedContainer, "Group selected")
    const sendToBackButton = findButtonByText(renderedContainer, "Send to back")
    const sendBackwardButton = findButtonByText(renderedContainer, "Send backward")
    const bringForwardButton = findButtonByText(renderedContainer, "Bring forward")
    const bringToFrontButton = findButtonByText(renderedContainer, "Bring to front")
    const ungroupButton = findButtonByText(renderedContainer, "Ungroup-like")

    persistButton?.click()
    closeButton?.click()
    rememberButton?.click()
    groupButton?.click()
    sendToBackButton?.click()
    sendBackwardButton?.click()
    bringForwardButton?.click()
    bringToFrontButton?.click()
    ungroupButton?.click()

    await flushAsync()

    expect(onPersistTab).toHaveBeenCalledTimes(1)
    expect(onCloseTab).toHaveBeenCalledTimes(1)
    expect(onTogglePersistLastMoveAcrossRestarts).toHaveBeenCalledWith(true)
    expect(onNotify).toHaveBeenCalledWith("Layer Manager sidepanel persisted.")
    expect(onNotify).toHaveBeenCalledWith("Last move destination will persist across restarts.")
    expect(rememberButton?.textContent).toBe("Remember last move: on")
    expect(groupButton?.disabled).toBe(false)
    expect(sendToBackButton?.disabled).toBe(false)
    expect(sendBackwardButton?.disabled).toBe(false)
    expect(bringForwardButton?.disabled).toBe(false)
    expect(bringToFrontButton?.disabled).toBe(false)
    expect(ungroupButton?.disabled).toBe(false)
    expect(findButtonByText(renderedContainer, "Reparent selected")).toBeUndefined()
    expect(onGroupSelected).toHaveBeenCalledTimes(1)
    expect(onReorderSelected).toHaveBeenNthCalledWith(1, "back")
    expect(onReorderSelected).toHaveBeenNthCalledWith(2, "backward")
    expect(onReorderSelected).toHaveBeenNthCalledWith(3, "forward")
    expect(onReorderSelected).toHaveBeenNthCalledWith(4, "front")
    expect(onUngroupLikeSelection).toHaveBeenCalledTimes(1)
  })

  it("renders persisted badge and keeps selection actions disabled when no selection", () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    renderSidepanelToolbar({
      container: container as unknown as HTMLElement,
      ownerDocument: document as unknown as Document,
      hasActions: true,
      selectedElementCount: 0,
      canPersistTab: true,
      didPersistTab: true,
      canCloseTab: false,
      canPersistLastMovePreference: false,
      persistLastMoveAcrossRestarts: false,
      createToolbarButton: (ownerDocument, label, _action): HTMLButtonElement => {
        const button = (ownerDocument as unknown as FakeDocument).createElement("button")
        button.textContent = label
        return button as unknown as HTMLButtonElement
      },
      onGroupSelected: async () => {},
      onReorderSelected: async () => {},
      onUngroupLikeSelection: async () => {},
      onTogglePersistLastMoveAcrossRestarts: async () => true,
      onNotify: () => {},
      onPersistTab: () => true,
      onCloseTab: () => {},
    })

    const renderedContainer = container as unknown as FakeDomElement
    const elements = flattenElements(renderedContainer)

    const persistedBadge = elements.find(
      (element) => element.tagName === "SPAN" && element.textContent === "Persisted ✓",
    )

    const groupButton = findButtonByText(renderedContainer, "Group selected")
    const sendToBackButton = findButtonByText(renderedContainer, "Send to back")
    const sendBackwardButton = findButtonByText(renderedContainer, "Send backward")
    const bringForwardButton = findButtonByText(renderedContainer, "Bring forward")
    const bringToFrontButton = findButtonByText(renderedContainer, "Bring to front")
    const ungroupButton = findButtonByText(renderedContainer, "Ungroup-like")

    expect(persistedBadge).toBeDefined()
    expect(findButtonByText(renderedContainer, "Persist tab")).toBeUndefined()
    expect(findButtonByText(renderedContainer, "Close tab")).toBeUndefined()
    expect(findButtonByText(renderedContainer, "Remember last move: off")).toBeUndefined()
    expect(findButtonByText(renderedContainer, "Reparent selected")).toBeUndefined()
    expect(groupButton?.disabled).toBe(true)
    expect(sendToBackButton?.disabled).toBe(true)
    expect(sendBackwardButton?.disabled).toBe(true)
    expect(bringForwardButton?.disabled).toBe(true)
    expect(bringToFrontButton?.disabled).toBe(true)
    expect(ungroupButton?.disabled).toBe(true)
  })
})
