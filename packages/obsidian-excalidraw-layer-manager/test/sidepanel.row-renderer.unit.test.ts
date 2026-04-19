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
    reorderRelativeToNodeIds: vi.fn(async () => makeAppliedOutcome()),
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
        ;(button as FakeDomElement & { ariaLabel?: string }).ariaLabel = icon.title ?? ""
        button.addEventListener("click", () => {
          void action()
        })
        return button as unknown as HTMLButtonElement
      },
    )

    const { row } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      rowDomId: "row-A",
      node: makeNode("A", {
        canExpand: true,
        label: "Alpha",
      }),
      depth: 2,
      selected: true,
      focused: true,
      dropHintKind: "reparent",
      dropHintLabel: "drop to root",
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

    const renderedRow = row as unknown as FakeDomElement & {
      ariaLabel?: string
      ariaSelected?: string
      ariaLevel?: string
      ariaExpanded?: string
    }
    const expandButton = renderedRow.children[0] as
      | (FakeDomElement & { ariaLabel?: string })
      | undefined
    const typeBadge = renderedRow.children.find(
      (child) => child.tagName === "SPAN" && child.textContent === "[element]",
    )
    const label = renderedRow.children.find(
      (child) => child.tagName === "SPAN" && child.textContent === "Alpha",
    )
    const dropHintAssistiveLabel = renderedRow.children.find(
      (child) => child.tagName === "SPAN" && child.textContent === "drop to root",
    )
    const textFragments = flattenElements(renderedRow)
      .map((child) => child.textContent ?? "")
      .filter((text) => text.length > 0)

    expect((renderedRow as FakeDomElement & { id?: string; role?: string }).id).toBe("row-A")
    expect((renderedRow as FakeDomElement & { id?: string; role?: string }).role).toBe("treeitem")
    expect(renderedRow.style["paddingLeft"]).toBe("24px")
    expect(renderedRow.style["paddingRight"]).toBe("2px")
    expect(renderedRow.style["position"]).toBe("relative")
    expect(renderedRow.style["gap"]).toBe("3px")
    expect(renderedRow.style["border"]).toBe("1px solid transparent")
    expect(renderedRow.style["cursor"]).toBe("pointer")
    expect(renderedRow.style["background"]).toContain("interactive-accent-hover")
    expect(renderedRow.style["borderColor"]).toContain("interactive-accent")
    expect(renderedRow.style["outline"]).toContain("2px solid")
    expect(renderedRow.style["outline"]).toContain("text-normal")
    expect(renderedRow.style["boxShadow"]).toContain("inset")
    expect(renderedRow.ariaLabel).toBe("[element] Alpha")
    expect(renderedRow.ariaSelected).toBe("true")
    expect(renderedRow.ariaLevel).toBe("3")
    expect(renderedRow.ariaExpanded).toBe("false")
    expect(expandButton?.textContent).toBe("▸")
    expect(expandButton?.ariaLabel).toBe("Expand row Alpha")
    expect(typeBadge).toBeDefined()
    expect(textFragments).toContain("drop to root")
    expect(dropHintAssistiveLabel?.style["position"]).toBe("absolute")
    expect(dropHintAssistiveLabel?.style["clipPath"]).toBe("inset(50%)")

    expect(renderedRow.style["boxShadow"]).toContain("inset 0 0 0 2px")

    expandButton?.dispatchEvent(new FakeDomEvent("click"))
    expect(toggleExpanded).toHaveBeenCalledWith("A")
  })

  it("renders stronger reorder preview cues without implying contain-style targeting", () => {
    const document = new FakeDocument()
    const actions = makeActions()

    const { row } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      rowDomId: "row-reorder-preview",
      node: makeNode("A", { label: "Alpha" }),
      depth: 0,
      selected: false,
      focused: false,
      dropHintKind: "reorderBefore",
      dropHintLabel: "reorder before row",
      actions,
      styleConfig: rowStyleConfig,
      nodeVisualState: {
        visibility: "visible",
        lock: "unlocked",
      },
      filterMatchKind: "none",
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
    const reorderAssistiveLabel = renderedRow.children.find(
      (child) => child.tagName === "SPAN" && child.textContent === "reorder before row",
    )
    const textFragments = flattenElements(renderedRow)
      .map((child) => child.textContent ?? "")
      .filter((text) => text.length > 0)

    expect(renderedRow.style["boxShadow"]).toContain("inset 0 3px 0 0")
    expect(renderedRow.style["background"] ?? "").not.toContain("interactive-accent-hover")
    expect(renderedRow.style["borderColor"] ?? "").not.toContain("interactive-accent")
    expect(reorderAssistiveLabel?.style["position"]).toBe("absolute")
    expect(reorderAssistiveLabel?.style["width"]).toBe("1px")
    expect(textFragments).toContain("reorder before row")
  })

  it("wires inline rename input draft/commit/cancel handlers", () => {
    const document = new FakeDocument()
    const actions = makeActions()
    const onDraftChange = vi.fn<(nextDraft: string) => void>()
    const onCommit = vi.fn<(nodeId: string) => void>()
    const onCancel = vi.fn<() => void>()

    const { row, renameInputForAutofocus } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      rowDomId: "row-A",
      node: makeNode("A", { label: "Alpha" }),
      depth: 0,
      selected: false,
      focused: false,
      dropHintKind: null,
      dropHintLabel: null,
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

  it("surfaces collapsed container structure cues in badges and aria labels", () => {
    const document = new FakeDocument()
    const actions = makeActions()

    const { row } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      rowDomId: "row-G-collapsed",
      node: makeNode("G", {
        type: "group",
        canExpand: true,
        isExpanded: false,
        elementIds: ["A", "B"],
        label: "Collapsed Group",
      }),
      depth: 0,
      selected: false,
      focused: false,
      dropHintKind: null,
      dropHintLabel: null,
      actions,
      styleConfig: rowStyleConfig,
      nodeVisualState: {
        visibility: "visible",
        lock: "unlocked",
      },
      filterMatchKind: "none",
      inlineRenameState: null,
      onToggleExpanded: () => {},
      onInlineRenameDraftChange: () => {},
      onInlineRenameCommit: () => {},
      onInlineRenameCancel: () => {},
      isInlineRenameActiveForNode: () => false,
      onRenameNodeFromAction: () => {},
      createIconActionButton: (
        ownerDocument: Document,
        icon: { readonly title?: string },
        _action,
      ): HTMLButtonElement => {
        const button = (ownerDocument as unknown as FakeDocument).createElement("button")
        ;(button as FakeDomElement & { ariaLabel?: string }).ariaLabel = icon.title ?? ""
        return button as unknown as HTMLButtonElement
      },
    })

    const renderedRow = row as unknown as FakeDomElement & {
      ariaLabel?: string
      ariaExpanded?: string
    }
    const textFragments = flattenElements(renderedRow)
      .map((child) => child.textContent ?? "")
      .filter((text) => text.length > 0)

    expect(textFragments).toContain("collapsed")
    expect(textFragments).toContain("2 items")
    expect(
      (renderedRow.children[0] as FakeDomElement as FakeDomElement & { ariaLabel?: string })
        .ariaLabel,
    ).toBe("Expand row Collapsed Group")
    expect(renderedRow.ariaExpanded).toBe("false")
    expect(renderedRow.ariaLabel).toBe("[group] Collapsed Group · collapsed · 2 items")
  })

  it("renders mixed-state badges and tree hierarchy metadata", () => {
    const document = new FakeDocument()
    const actions = makeActions()

    const { row } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      rowDomId: "row-G-expanded",
      node: makeNode("G", {
        type: "group",
        canExpand: true,
        isExpanded: true,
        children: [makeNode("A"), makeNode("B")],
        elementIds: ["A", "B", "C"],
        label: "Group Alpha",
      }),
      depth: 0,
      selected: false,
      focused: false,
      dropHintKind: null,
      dropHintLabel: null,
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
      createIconActionButton: (
        ownerDocument: Document,
        icon: { readonly title?: string },
        _action,
      ): HTMLButtonElement => {
        const button = (ownerDocument as unknown as FakeDocument).createElement("button")
        ;(button as FakeDomElement & { ariaLabel?: string }).ariaLabel = icon.title ?? ""
        return button as unknown as HTMLButtonElement
      },
    })

    const renderedRow = row as unknown as FakeDomElement & {
      ariaLabel?: string
      ariaExpanded?: string
    }
    const textFragments = flattenElements(renderedRow)
      .map((child) => child.textContent ?? "")
      .filter((text) => text.length > 0)
    const actionLabels = renderedRow.children
      .filter((child) => child.tagName === "BUTTON")
      .map((child) => (child as FakeDomElement & { ariaLabel?: string }).ariaLabel ?? "")

    expect(textFragments).toContain("[group]")
    expect(textFragments).toContain("Group Alpha")
    expect(textFragments).toContain("nested match")
    expect(textFragments).toContain("2 child rows")
    expect(textFragments).toContain("3 items")
    expect(textFragments).toContain("some hidden")
    expect(textFragments).toContain("some locked")
    expect(renderedRow.style["boxShadow"]).toContain("inset 3px 0 0 0")
    expect(renderedRow.style["boxShadow"]).toContain("inset -3px 0 0 0")
    expect(renderedRow.ariaExpanded).toBe("true")
    expect(renderedRow.ariaLabel).toBe(
      "[group] Group Alpha · 2 child rows · 3 items · nested match · some hidden · some locked",
    )
    expect(actionLabels).toContain("Collapse row Group Alpha")
    expect(actionLabels).toContain("Show hidden items")
    expect(actionLabels).toContain("Lock unlocked items")
    const actionButtons = renderedRow.children.filter(
      (child) =>
        child.tagName === "BUTTON" &&
        !((child as FakeDomElement & { ariaLabel?: string }).ariaLabel ?? "").startsWith(
          "Collapse row",
        ),
    )
    for (const button of actionButtons) {
      expect(button.style["background"]).toContain("background-primary-alt")
      expect(button.style["border"]).toContain("background-modifier-border")
    }
  })

  it("keeps rendered hierarchy semantics when filter projection exposes descendants", () => {
    const document = new FakeDocument()
    const actions = makeActions()

    const { row } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      rowDomId: "row-G-filtered",
      node: makeNode("G", {
        type: "group",
        canExpand: false,
        isExpanded: true,
        children: [makeNode("A")],
        elementIds: ["A"],
        label: "Filtered Group",
      }),
      depth: 0,
      selected: false,
      focused: false,
      dropHintKind: null,
      dropHintLabel: null,
      actions,
      styleConfig: rowStyleConfig,
      nodeVisualState: {
        visibility: "visible",
        lock: "unlocked",
      },
      filterMatchKind: "descendant",
      inlineRenameState: null,
      onToggleExpanded: () => {},
      onInlineRenameDraftChange: () => {},
      onInlineRenameCommit: () => {},
      onInlineRenameCancel: () => {},
      isInlineRenameActiveForNode: () => false,
      onRenameNodeFromAction: () => {},
      createIconActionButton: (
        ownerDocument: Document,
        icon: { readonly title?: string },
        _action,
      ): HTMLButtonElement => {
        const button = (ownerDocument as unknown as FakeDocument).createElement("button")
        ;(button as FakeDomElement & { ariaLabel?: string }).ariaLabel = icon.title ?? ""
        return button as unknown as HTMLButtonElement
      },
    })

    const renderedRow = row as unknown as FakeDomElement & {
      ariaExpanded?: string
    }

    expect(renderedRow.ariaExpanded).toBe("true")
    expect((renderedRow.children[0] as FakeDomElement).tagName).toBe("SPAN")
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
        ;(button as FakeDomElement & { ariaLabel?: string }).ariaLabel = icon.title ?? ""
        button.addEventListener("click", () => {
          void action()
        })
        return button as unknown as HTMLButtonElement
      },
    )

    const { row } = renderSidepanelRow({
      ownerDocument: document as unknown as Document,
      rowDomId: "row-A-hidden",
      node: makeNode("A", { label: "Alpha" }),
      depth: 0,
      selected: false,
      focused: false,
      dropHintKind: null,
      dropHintLabel: null,
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

    const renderedRow = row as unknown as FakeDomElement & { ariaLabel?: string }
    const label = renderedRow.children.find(
      (child) => child.tagName === "SPAN" && child.textContent === "Alpha",
    )
    const buttons = renderedRow.children.filter((child) => child.tagName === "BUTTON")
    const showButton = buttons.find(
      (button) =>
        (button as FakeDomElement & { ariaLabel?: string }).ariaLabel === "Show all items",
    )
    const unlockButton = buttons.find(
      (button) =>
        (button as FakeDomElement & { ariaLabel?: string }).ariaLabel === "Unlock all items",
    )
    const renameButton = buttons.find(
      (button) => (button as FakeDomElement & { ariaLabel?: string }).ariaLabel === "Rename layer",
    )
    const deleteButton = buttons.find(
      (button) => (button as FakeDomElement & { ariaLabel?: string }).ariaLabel === "Delete layer",
    )

    showButton?.click()
    unlockButton?.click()
    renameButton?.click()
    deleteButton?.click()

    expect(label?.style["textDecoration"]).toBe("line-through")
    expect(label?.style["opacity"]).toBe("0.6")
    expect(renderedRow.style["boxShadow"]).toContain("inset 3px 0 0 0")
    expect(renderedRow.style["boxShadow"]).toContain("inset -3px 0 0 0")
    expect(renderedRow.ariaLabel).toBe("[element] Alpha · hidden · locked")
    expect(createIconActionButton).toHaveBeenCalledTimes(4)
    for (const button of buttons) {
      expect(button.style["background"]).toContain("background-primary-alt")
      expect(button.style["border"]).toContain("background-modifier-border")
      expect(button.style["opacity"]).toBe("0.85")
    }
    expect(actions.toggleVisibilityNode).toHaveBeenCalledWith("A")
    expect(actions.toggleLockNode).toHaveBeenCalledWith("A")
    expect(onRenameNodeFromAction).toHaveBeenCalledWith("A", "Alpha")
    expect(actions.deleteNode).toHaveBeenCalledWith("A")
  })
})
