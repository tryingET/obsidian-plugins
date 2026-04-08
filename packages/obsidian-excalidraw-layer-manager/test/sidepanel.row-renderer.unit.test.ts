import { describe, expect, it, vi } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import type { LayerManagerUiActions } from "../src/ui/renderer.js"
import { renderSidepanelRow } from "../src/ui/sidepanel/render/rowRenderer.js"

class FakeDomEvent {
  readonly type: string
  readonly key: string
  defaultPrevented = false
  propagationStopped = false
  target: EventTarget | null = null

  constructor(type: string, key = "") {
    this.type = type
    this.key = key
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

  type = ""
  textContent: string | null = ""
  value = ""
  title = ""
  tabIndex = 0
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

const makeNode = (id: string, overrides: Partial<LayerNode> = {}): LayerNode => ({
  id,
  type: "element",
  elementIds: [id],
  primaryElementId: id,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId: null,
  label: id,
  ...overrides,
})

const makeAppliedOutcome = () =>
  ({
    status: "applied",
    attempts: 1,
  }) as const

const makeActions = (): LayerManagerUiActions => {
  return {
    beginInteraction: vi.fn(),
    endInteraction: vi.fn(),
    toggleExpanded: vi.fn(),
    toggleVisibilityNode: vi.fn(async () => makeAppliedOutcome()),
    toggleLockNode: vi.fn(async () => makeAppliedOutcome()),
    renameNode: vi.fn(async () => makeAppliedOutcome()),
    deleteNode: vi.fn(async () => makeAppliedOutcome()),
    createGroupFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    reorderFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    reparentFromNodeIds: vi.fn(async () => makeAppliedOutcome()),
    commands: {
      toggleVisibility: vi.fn(async () => makeAppliedOutcome()),
      toggleLock: vi.fn(async () => makeAppliedOutcome()),
      renameNode: vi.fn(async () => makeAppliedOutcome()),
      deleteNode: vi.fn(async () => makeAppliedOutcome()),
      createGroup: vi.fn(async () => makeAppliedOutcome()),
      reorder: vi.fn(async () => makeAppliedOutcome()),
      reparent: vi.fn(async () => makeAppliedOutcome()),
    },
  }
}

const rowStyleConfig = {
  indentStepPx: 12,
  rowMinHeightPx: 22,
  rowFontSizePx: 11,
  iconButtonSizePx: 18,
  iconSizePx: 14,
} as const

describe("sidepanel row renderer", () => {
  it("renders row shell styling and expand toggle interactions", () => {
    const document = new FakeDocument()
    const actions = makeActions()
    const toggleExpanded = vi.fn<(nodeId: string) => void>()

    const createIconActionButton = vi.fn(
      (
        ownerDocument: Document,
        icon: { readonly title?: string },
        action: () => Promise<unknown>,
      ): HTMLButtonElement => {
        const button = (ownerDocument as unknown as FakeDocument).createElement("button")
        button.title = icon.title ?? ""
        button.addEventListener("click", () => {
          void action()
        })
        return button as unknown as HTMLButtonElement
      },
    )

    const { row } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      node: makeNode("A", {
        canExpand: true,
        label: "Alpha",
      }),
      depth: 2,
      selected: true,
      focused: true,
      dropHinted: true,
      actions,
      styleConfig: rowStyleConfig,
      nodeVisualState: {
        visibility: "visible",
        lock: "unlocked",
      },
      filterMatchKind: "none",
      inlineRenameState: null,
      onToggleExpanded: toggleExpanded,
      onInlineRenameDraftChange: () => {},
      onInlineRenameCommit: () => {},
      onInlineRenameCancel: () => {},
      isInlineRenameActiveForNode: () => false,
      onRenameNodeFromAction: () => {},
      createIconActionButton,
    })

    const renderedRow = row as unknown as FakeDomElement
    const expandButton = renderedRow.children[0]

    expect(renderedRow.style["paddingLeft"]).toBe("24px")
    expect(renderedRow.style["cursor"]).toBe("pointer")
    expect(renderedRow.style["background"]).toContain("interactive-accent-hover")
    expect(renderedRow.style["outline"]).toContain("1px solid")
    expect(renderedRow.style["boxShadow"]).toContain("inset")
    expect(expandButton?.textContent).toBe("▸")

    expandButton?.dispatchEvent(new FakeDomEvent("click"))
    expect(toggleExpanded).toHaveBeenCalledWith("A")
  })

  it("wires inline rename input draft/commit/cancel handlers", () => {
    const document = new FakeDocument()
    const actions = makeActions()
    const onDraftChange = vi.fn<(nextDraft: string) => void>()
    const onCommit = vi.fn<(nodeId: string) => void>()
    const onCancel = vi.fn<() => void>()

    const { row, renameInputForAutofocus } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      node: makeNode("A", { label: "Alpha" }),
      depth: 0,
      selected: false,
      focused: false,
      dropHinted: false,
      actions,
      styleConfig: rowStyleConfig,
      nodeVisualState: {
        visibility: "visible",
        lock: "unlocked",
      },
      filterMatchKind: "none",
      inlineRenameState: {
        nodeId: "A",
        draft: "Draft",
        shouldAutofocusInput: true,
      },
      onToggleExpanded: () => {},
      onInlineRenameDraftChange: onDraftChange,
      onInlineRenameCommit: onCommit,
      onInlineRenameCancel: onCancel,
      isInlineRenameActiveForNode: () => true,
      onRenameNodeFromAction: () => {},
      createIconActionButton: (ownerDocument: Document, _icon, _action): HTMLButtonElement => {
        return (ownerDocument as unknown as FakeDocument).createElement(
          "button",
        ) as unknown as HTMLButtonElement
      },
    })

    const renderedRow = row as unknown as FakeDomElement
    const renameInput = renderedRow.children.find((child) => child.tagName === "INPUT")

    expect(renameInputForAutofocus).toBe(renameInput as unknown as HTMLInputElement)

    if (!renameInput) {
      throw new Error("Expected inline rename input")
    }

    renameInput.value = "Updated"
    renameInput.dispatchEvent(new FakeDomEvent("input"))

    const enterEvent = new FakeDomEvent("keydown", "Enter")
    renameInput.dispatchEvent(enterEvent)

    const escapeEvent = new FakeDomEvent("keydown", "Escape")
    renameInput.dispatchEvent(escapeEvent)

    renameInput.dispatchEvent(new FakeDomEvent("blur"))

    expect(onDraftChange).toHaveBeenCalledWith("Updated")
    expect(onCommit).toHaveBeenCalledTimes(2)
    expect(onCommit).toHaveBeenNthCalledWith(1, "A")
    expect(onCommit).toHaveBeenNthCalledWith(2, "A")
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(enterEvent.defaultPrevented).toBe(true)
    expect(escapeEvent.defaultPrevented).toBe(true)
  })

  it("renders mixed-state badges and search-match metadata", () => {
    const document = new FakeDocument()
    const actions = makeActions()

    const { row } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      node: makeNode("G", {
        type: "group",
        elementIds: ["A", "B", "C"],
        label: "Group Alpha",
      }),
      depth: 0,
      selected: false,
      focused: false,
      dropHinted: false,
      actions,
      styleConfig: rowStyleConfig,
      nodeVisualState: {
        visibility: "mixed",
        lock: "mixed",
      },
      filterMatchKind: "descendant",
      inlineRenameState: null,
      onToggleExpanded: () => {},
      onInlineRenameDraftChange: () => {},
      onInlineRenameCommit: () => {},
      onInlineRenameCancel: () => {},
      isInlineRenameActiveForNode: () => false,
      onRenameNodeFromAction: () => {},
      createIconActionButton: (ownerDocument: Document, _icon, _action): HTMLButtonElement => {
        return (ownerDocument as unknown as FakeDocument).createElement(
          "button",
        ) as unknown as HTMLButtonElement
      },
    })

    const renderedRow = row as unknown as FakeDomElement
    const textFragments = flattenElements(renderedRow)
      .map((child) => child.textContent ?? "")
      .filter((text) => text.length > 0)

    expect(textFragments).toContain("contains match")
    expect(textFragments).toContain("3 items")
    expect(textFragments).toContain("mixed hidden")
    expect(textFragments).toContain("mixed lock")
  })

  it("renders row action buttons and routes callbacks", () => {
    const document = new FakeDocument()
    const actions = makeActions()
    const onRenameNodeFromAction = vi.fn<(nodeId: string, initialValue: string) => void>()

    const createIconActionButton = vi.fn(
      (
        ownerDocument: Document,
        icon: { readonly title?: string },
        action: () => Promise<unknown>,
      ): HTMLButtonElement => {
        const button = (ownerDocument as unknown as FakeDocument).createElement("button")
        button.title = icon.title ?? ""
        button.addEventListener("click", () => {
          void action()
        })
        return button as unknown as HTMLButtonElement
      },
    )

    const { row } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      node: makeNode("A", { label: "Alpha" }),
      depth: 0,
      selected: false,
      focused: false,
      dropHinted: false,
      actions,
      styleConfig: rowStyleConfig,
      nodeVisualState: {
        visibility: "hidden",
        lock: "locked",
      },
      filterMatchKind: "none",
      inlineRenameState: null,
      onToggleExpanded: () => {},
      onInlineRenameDraftChange: () => {},
      onInlineRenameCommit: () => {},
      onInlineRenameCancel: () => {},
      isInlineRenameActiveForNode: () => false,
      onRenameNodeFromAction,
      createIconActionButton,
    })

    const renderedRow = row as unknown as FakeDomElement
    const buttons = renderedRow.children.filter((child) => child.tagName === "BUTTON")
    const showButton = buttons.find((button) => button.title === "Show layer")
    const unlockButton = buttons.find((button) => button.title === "Unlock layer")
    const renameButton = buttons.find((button) => button.title === "Rename layer")
    const deleteButton = buttons.find((button) => button.title === "Delete layer")

    showButton?.click()
    unlockButton?.click()
    renameButton?.click()
    deleteButton?.click()

    expect(createIconActionButton).toHaveBeenCalledTimes(4)
    expect(actions.toggleVisibilityNode).toHaveBeenCalledWith("A")
    expect(actions.toggleLockNode).toHaveBeenCalledWith("A")
    expect(onRenameNodeFromAction).toHaveBeenCalledWith("A", "Alpha")
    expect(actions.deleteNode).toHaveBeenCalledWith("A")
  })
})
