import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ScriptSettings } from "../src/adapter/excalidraw-types.js"
import type { LayerNode } from "../src/model/tree.js"
import type { ExecuteIntentOutcome } from "../src/runtime/intentExecution.js"
import { createExcalidrawSidepanelRenderer } from "../src/ui/excalidrawSidepanelRenderer.js"
import type { LayerManagerUiActions } from "../src/ui/renderer.js"

interface FakeDomEventInit {
  key?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

class FakeDomEvent {
  readonly type: string
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  target: EventTarget | null = null
  defaultPrevented = false
  propagationStopped = false

  constructor(type: string, init: FakeDomEventInit = {}) {
    this.type = type
    this.key = init.key ?? ""
    this.ctrlKey = init.ctrlKey ?? false
    this.metaKey = init.metaKey ?? false
    this.altKey = init.altKey ?? false
    this.shiftKey = init.shiftKey ?? false
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
  type = ""
  value = ""
  disabled = false
  title = ""
  tabIndex = 0
  draggable = false
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

  contains(candidate: FakeDomElement | null): boolean {
    if (!candidate) {
      return false
    }

    if (candidate === this) {
      return true
    }

    for (const child of this.#children) {
      if (child.contains(candidate)) {
        return true
      }
    }

    return false
  }

  addEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set())
    }

    this.#listeners.get(type)?.add(listener)
  }

  removeEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    this.#listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: FakeDomEvent): boolean {
    if (!event.target) {
      event.target = this as unknown as EventTarget
    }

    const listeners = this.#listeners.get(event.type)
    if (!listeners || listeners.size === 0) {
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

  focus(): void {
    this.ownerDocument.activeElement = this
  }

  set innerHTML(value: string) {
    this.#children = []
    this.textContent = value
  }

  get innerHTML(): string {
    return this.textContent ?? ""
  }
}

class FakeDocument {
  activeElement: FakeDomElement | null = null
  #listeners = new Map<string, Set<(event: FakeDomEvent) => void>>()

  createElement(tagName: string): FakeDomElement {
    return new FakeDomElement(tagName, this)
  }

  addEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set())
    }

    this.#listeners.get(type)?.add(listener)
  }

  removeEventListener(type: string, listener: (event: FakeDomEvent) => void): void {
    this.#listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: FakeDomEvent): boolean {
    if (!event.target) {
      event.target = this as unknown as EventTarget
    }

    const listeners = this.#listeners.get(event.type)
    if (!listeners || listeners.size === 0) {
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
}

interface SidepanelTabHarness {
  readonly tab: {
    contentEl?: HTMLElement
    setContent?: (content: HTMLElement | string) => void
    setTitle: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    getHostEA: () => unknown
  }
  readonly contentEl: FakeDomElement
}

const makeSidepanelTab = (document: FakeDocument, hostEA: unknown): SidepanelTabHarness => {
  const contentEl = document.createElement("div")
  const setTitle = vi.fn()
  const open = vi.fn()
  const close = vi.fn()

  const tab: SidepanelTabHarness["tab"] = {
    contentEl: contentEl as unknown as HTMLElement,
    setTitle,
    open,
    close,
    getHostEA: () => hostEA,
  }

  return {
    tab,
    contentEl,
  }
}

const makeElementNode = (elementId: string, label = elementId): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: true,
  groupId: null,
  frameId: null,
  label,
})

const makeGroupNode = (
  groupId: string,
  children: readonly LayerNode[],
  isExpanded = true,
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: children.flatMap((child) => child.elementIds),
  primaryElementId: children[0]?.primaryElementId ?? `group-primary:${groupId}`,
  children,
  canExpand: true,
  isExpanded,
  groupId,
  frameId: null,
  label: groupId,
})

const makeAppliedOutcome = (): ExecuteIntentOutcome => ({
  status: "applied",
  attempts: 1,
})

const makeUiActions = (
  overrides: Partial<LayerManagerUiActions> = {},
): {
  readonly actions: LayerManagerUiActions
  readonly commandSpies: LayerManagerUiActions["commands"]
} => {
  const commandSpies = {
    toggleVisibility: vi.fn(async () => makeAppliedOutcome()),
    toggleLock: vi.fn(async () => makeAppliedOutcome()),
    renameNode: vi.fn(async () => makeAppliedOutcome()),
    deleteNode: vi.fn(async () => makeAppliedOutcome()),
    createGroup: vi.fn(async () => makeAppliedOutcome()),
    reorder: vi.fn(async () => makeAppliedOutcome()),
    reparent: vi.fn(async () => makeAppliedOutcome()),
  } satisfies LayerManagerUiActions["commands"]

  const actions: LayerManagerUiActions = {
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
    commands: commandSpies,
    ...overrides,
  }

  return {
    actions,
    commandSpies,
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

const findButtonByTitle = (root: FakeDomElement, title: string): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "BUTTON" && element.title === title)
}

const isRowFilterInput = (element: FakeDomElement): boolean => {
  return (element as FakeDomElement & { placeholder?: string }).placeholder === "Search layer rows"
}

const findFirstInput = (root: FakeDomElement): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "INPUT" && !isRowFilterInput(element))
}

const findRowTreeRoot = (root: FakeDomElement): FakeDomElement | undefined => {
  return flattenElements(root).find(
    (element) =>
      element.tagName === "DIV" && (element as FakeDomElement & { role?: string }).role === "tree",
  )
}

const getContentRoot = (contentEl: FakeDomElement): FakeDomElement => {
  const root = contentEl.children[0]
  if (!root) {
    throw new Error("Expected sidepanel content root to exist.")
  }

  return root
}

interface DispatchKeydownOptions {
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  eventTarget?: FakeDomElement
}

const dispatchKeydown = (
  receiver: FakeDomElement,
  key: string,
  options: DispatchKeydownOptions = {},
): void => {
  const init: FakeDomEventInit = {
    key,
  }

  if (options.ctrlKey !== undefined) {
    init.ctrlKey = options.ctrlKey
  }

  if (options.metaKey !== undefined) {
    init.metaKey = options.metaKey
  }

  if (options.altKey !== undefined) {
    init.altKey = options.altKey
  }

  if (options.shiftKey !== undefined) {
    init.shiftKey = options.shiftKey
  }

  const event = new FakeDomEvent("keydown", init)

  if (options.eventTarget) {
    event.target = options.eventTarget as unknown as EventTarget
  }

  receiver.dispatchEvent(event)
}

const dispatchDocumentKeydown = (
  receiver: FakeDocument,
  key: string,
  options: DispatchKeydownOptions = {},
): void => {
  const init: FakeDomEventInit = {
    key,
  }

  if (options.ctrlKey !== undefined) {
    init.ctrlKey = options.ctrlKey
  }

  if (options.metaKey !== undefined) {
    init.metaKey = options.metaKey
  }

  if (options.altKey !== undefined) {
    init.altKey = options.altKey
  }

  if (options.shiftKey !== undefined) {
    init.shiftKey = options.shiftKey
  }

  const event = new FakeDomEvent("keydown", init)

  if (options.eventTarget) {
    event.target = options.eventTarget as unknown as EventTarget
  }

  receiver.dispatchEvent(event)
}

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe("sidepanel focus + keyboard integration", () => {
  const globalRecord = globalThis as Record<string, unknown>

  let hadDocumentProperty = false
  let previousDocumentValue: unknown
  let fakeDocument: FakeDocument

  beforeEach(() => {
    hadDocumentProperty = Object.prototype.hasOwnProperty.call(globalRecord, "document")
    previousDocumentValue = globalRecord["document"]

    fakeDocument = new FakeDocument()
    globalRecord["document"] = fakeDocument as unknown as Document
  })

  afterEach(() => {
    if (hadDocumentProperty) {
      globalRecord["document"] = previousDocumentValue
      return
    }

    Reflect.deleteProperty(globalRecord, "document")
  })

  it("supports focused-row keyboard fallback for reorder and rename", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 2,
      actions,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)

    dispatchKeydown(contentRoot, "ArrowDown")
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    dispatchKeydown(contentRoot, "b", { shiftKey: true })
    await flushAsync()

    expect(actions.reorderFromNodeIds).toHaveBeenNthCalledWith(1, ["el:B"], "forward")
    expect(actions.reorderFromNodeIds).toHaveBeenNthCalledWith(2, ["el:B"], "back")

    dispatchKeydown(contentRoot, "Enter")
    await flushAsync()

    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input for focused-row rename fallback.")
    }

    input.value = "Keyboard rename"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")
    await flushAsync()

    expect(actions.renameNode).toHaveBeenCalledWith("el:B", "Keyboard rename")
    expect(actions.beginInteraction).not.toHaveBeenCalled()
    expect(actions.endInteraction).not.toHaveBeenCalled()
  })

  it("uses left/right focus semantics for expanded groups", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    const childNode = makeElementNode("Child")
    const groupNode = makeGroupNode("Outer", [childNode], true)

    renderer.render({
      tree: [groupNode, makeElementNode("After")],
      selectedIds: new Set(),
      sceneVersion: 3,
      actions,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)

    dispatchKeydown(contentRoot, "ArrowRight")
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    dispatchKeydown(contentRoot, "ArrowLeft")
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(actions.reorderFromNodeIds).toHaveBeenNthCalledWith(1, ["el:Child"], "forward")
    expect(actions.reorderFromNodeIds).toHaveBeenNthCalledWith(2, ["group:Outer"], "forward")
  })

  it("ignores modified shortcuts and text-input event targets", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions, commandSpies } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeGroupNode("Outer", [makeElementNode("Child")], false), makeElementNode("A")],
      selectedIds: new Set(["A"]),
      sceneVersion: 30,
      actions,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)

    const modifiedShortcutEvents: ReadonlyArray<
      {
        readonly key: string
      } & DispatchKeydownOptions
    > = [
      { key: "ArrowDown", ctrlKey: true },
      { key: "ArrowUp", metaKey: true },
      { key: "ArrowRight", altKey: true },
      { key: "ArrowLeft", ctrlKey: true },
      { key: "Enter", metaKey: true },
      { key: "Delete", altKey: true },
      { key: "f", ctrlKey: true },
      { key: "g", metaKey: true },
      { key: "u", altKey: true },
    ]

    for (const entry of modifiedShortcutEvents) {
      const options: DispatchKeydownOptions = {}

      if (entry.ctrlKey !== undefined) {
        options.ctrlKey = entry.ctrlKey
      }

      if (entry.metaKey !== undefined) {
        options.metaKey = entry.metaKey
      }

      if (entry.altKey !== undefined) {
        options.altKey = entry.altKey
      }

      dispatchKeydown(contentRoot, entry.key, options)
    }

    for (const tagName of ["input", "textarea", "select"] as const) {
      const textTarget = fakeDocument.createElement(tagName)
      dispatchKeydown(contentRoot, "f", { eventTarget: textTarget })
      dispatchKeydown(contentRoot, "Delete", { eventTarget: textTarget })
      dispatchKeydown(contentRoot, "ArrowRight", { eventTarget: textTarget })
      dispatchKeydown(contentRoot, "Enter", { eventTarget: textTarget })
    }

    await flushAsync()

    expect(actions.toggleExpanded).not.toHaveBeenCalled()
    expect(actions.reorderFromNodeIds).not.toHaveBeenCalled()
    expect(actions.createGroupFromNodeIds).not.toHaveBeenCalled()
    expect(actions.reparentFromNodeIds).not.toHaveBeenCalled()
    expect(actions.renameNode).not.toHaveBeenCalled()
    expect(actions.deleteNode).not.toHaveBeenCalled()
    expect(actions.beginInteraction).not.toHaveBeenCalled()
    expect(actions.endInteraction).not.toHaveBeenCalled()

    expect(commandSpies.reorder).not.toHaveBeenCalled()
    expect(commandSpies.createGroup).not.toHaveBeenCalled()
    expect(commandSpies.reparent).not.toHaveBeenCalled()
    expect(commandSpies.deleteNode).not.toHaveBeenCalled()
  })

  it("keeps document-level keyboard routing continuity after row-action rename blur transition", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A", "Old name"), makeElementNode("B"), makeElementNode("C")],
      selectedIds: new Set(),
      sceneVersion: 31,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    const renameButton = findButtonByTitle(contentRoot, "Rename layer")
    if (!renameButton) {
      throw new Error("Expected rename row action button to exist.")
    }

    renameButton.click()
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    const input = findFirstInput(contentRoot)
    if (!input) {
      throw new Error("Expected inline rename input to exist after clicking rename action.")
    }

    input.value = "Renamed from row action route"
    input.dispatchEvent(new FakeDomEvent("input"))
    dispatchKeydown(input, "Enter")

    const outsideTarget = fakeDocument.createElement("div")
    fakeDocument.activeElement = outsideTarget

    const focusOutEvent = new FakeDomEvent("focusout")
    ;(focusOutEvent as unknown as { relatedTarget?: EventTarget | null }).relatedTarget =
      outsideTarget as unknown as EventTarget

    contentRoot.dispatchEvent(focusOutEvent)
    await flushAsync()

    expect(actions.renameNode).toHaveBeenCalledWith("el:A", "Renamed from row action route")

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    const rowsBeforeArrow = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const focusedIndexBeforeArrow = rowsBeforeArrow.findIndex(
      (element) => (element.style["outline"]?.length ?? 0) > 0,
    )

    expect(focusedIndexBeforeArrow).toBeGreaterThanOrEqual(0)

    const moveKey = focusedIndexBeforeArrow >= rowsBeforeArrow.length - 1 ? "ArrowUp" : "ArrowDown"

    dispatchDocumentKeydown(fakeDocument, moveKey, { eventTarget: outsideTarget })
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    expect(fakeDocument.activeElement).toBe(findRowTreeRoot(contentRoot))

    const rowsAfterArrow = flattenElements(contentRoot).filter(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    const focusedIndexAfterArrow = rowsAfterArrow.findIndex(
      (element) => (element.style["outline"]?.length ?? 0) > 0,
    )

    expect(focusedIndexAfterArrow).toBeGreaterThanOrEqual(0)
    expect(focusedIndexAfterArrow).not.toBe(focusedIndexBeforeArrow)

    dispatchDocumentKeydown(fakeDocument, "Enter", { eventTarget: outsideTarget })
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    expect(findFirstInput(contentRoot)).toBeDefined()
  })

  it("keeps row focus marker when host emits immediate blur after keyboard arrow navigation", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeElementNode("B"), makeElementNode("C")],
      selectedIds: new Set(),
      sceneVersion: 32,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    const row = flattenElements(contentRoot).find(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    if (!row) {
      throw new Error("Expected a clickable row in sidepanel content.")
    }

    row.click()
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")

    const outsideTarget = fakeDocument.createElement("div")
    fakeDocument.activeElement = outsideTarget

    const focusOutEvent = new FakeDomEvent("focusout")
    ;(focusOutEvent as unknown as { relatedTarget?: EventTarget | null }).relatedTarget =
      outsideTarget as unknown as EventTarget

    contentRoot.dispatchEvent(focusOutEvent)
    await flushAsync()

    const refreshedRoot = getContentRoot(sidepanelTab.contentEl)
    const hasFocusedRow = flattenElements(refreshedRoot).some((element) => {
      return (element.style["outline"]?.length ?? 0) > 0
    })

    expect(hasFocusedRow).toBe(true)
  })

  it("keeps focused-row highlight when sidepanel focus leaves the content root", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: [makeElementNode("A"), makeElementNode("B")],
      selectedIds: new Set(),
      sceneVersion: 33,
      actions,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const row = flattenElements(contentRoot).find(
      (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
    )

    if (!row) {
      throw new Error("Expected a clickable row in sidepanel content.")
    }

    row.click()
    await flushAsync()

    const hasFocusedBeforeBlur = flattenElements(contentRoot).some((element) => {
      return (element.style["outline"]?.length ?? 0) > 0
    })

    expect(hasFocusedBeforeBlur).toBe(true)

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve()
      }, 520)
    })

    const outsideTarget = fakeDocument.createElement("div")
    fakeDocument.activeElement = outsideTarget

    const focusOutEvent = new FakeDomEvent("focusout")
    ;(focusOutEvent as unknown as { relatedTarget?: EventTarget | null }).relatedTarget =
      outsideTarget as unknown as EventTarget

    contentRoot.dispatchEvent(focusOutEvent)
    await flushAsync()

    const refreshedRoot = getContentRoot(sidepanelTab.contentEl)
    const hasFocusedAfterBlur = flattenElements(refreshedRoot).some((element) => {
      return (element.style["outline"]?.length ?? 0) > 0
    })

    expect(hasFocusedAfterBlur).toBe(true)
  })
})
