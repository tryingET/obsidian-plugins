import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ScriptSettings } from "../src/adapter/excalidraw-types.js"
import type { LayerNode } from "../src/model/tree.js"
import type { ExecuteIntentOutcome } from "../src/runtime/intentExecution.js"
import { createExcalidrawSidepanelRenderer } from "../src/ui/excalidrawSidepanelRenderer.js"
import type { LayerManagerUiActions } from "../src/ui/renderer.js"

import {
  FakeDocument,
  type FakeDomElement,
  FakeDomEvent,
  dispatchDocumentKeydown,
  dispatchKeydown,
  findButtonByTitle,
  findFirstInput,
  findFocusedInteractiveRow,
  findRowTreeRoot,
  flattenElements,
  flushAsync,
  getContentRoot,
  makeSidepanelTab,
} from "./sidepanelTestHarness.js"
import type { DispatchKeydownOptions, SidepanelTabHarness } from "./sidepanelTestHarness.js"

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

  it("renders keyboard hint copy in row-selection terms", () => {
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
      tree: [makeElementNode("A")],
      selectedIds: new Set(),
      sceneVersion: 29,
      actions,
    })

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const textFragments = flattenElements(contentRoot)
      .map((element) => element.textContent ?? "")
      .filter((text) => text.length > 0)

    expect(textFragments).toContain(
      "Shortcuts: ↑/↓ focus rows · Shift+↑/↓ extend row selection · Home/End bounds · PgUp/PgDn page · Shift+PgUp/PgDn extend page · Space toggle row · Shift+Space range rows · ←/→ collapse/expand · Enter rename · Del delete · F/B reorder · Shift+F/B front/back · G/U structural",
    )
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
      { key: "Home", metaKey: true },
      { key: "End", ctrlKey: true },
      { key: "PageDown", altKey: true },
      { key: "PageUp", ctrlKey: true },
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
      dispatchKeydown(contentRoot, "Home", { eventTarget: textTarget })
      dispatchKeydown(contentRoot, "PageDown", { eventTarget: textTarget })
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

  it("supports Home End and PageUp PageDown focus navigation", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    sidepanelTab.contentEl.clientHeight = 120
    const { actions } = makeUiActions()
    const reorderFromNodeIdsMock = actions.reorderFromNodeIds as unknown as ReturnType<typeof vi.fn>

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: Array.from({ length: 12 }, (_, index) =>
        makeElementNode(`${index + 1}`, `Row ${index + 1}`),
      ),
      selectedIds: new Set(),
      sceneVersion: 31,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "ArrowDown")
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "PageDown")
    await flushAsync()

    const scrollTopAfterPageDown = sidepanelTab.contentEl.scrollTop

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    const pageDownTargetNodeIds = reorderFromNodeIdsMock.mock.calls[0]?.[0] as
      | readonly string[]
      | undefined

    expect(pageDownTargetNodeIds).toBeDefined()
    expect(pageDownTargetNodeIds?.[0]).not.toBe("el:1")
    expect(scrollTopAfterPageDown).toBeGreaterThan(0)

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "PageUp")
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    const pageUpTargetNodeIds = reorderFromNodeIdsMock.mock.calls[1]?.[0] as
      | readonly string[]
      | undefined

    expect(pageUpTargetNodeIds).toBeDefined()
    expect(Number((pageUpTargetNodeIds?.[0] ?? "el:0").replace("el:", ""))).toBeLessThan(
      Number((pageDownTargetNodeIds?.[0] ?? "el:0").replace("el:", "")),
    )
    expect(sidepanelTab.contentEl.scrollTop).toBeLessThan(scrollTopAfterPageDown)

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "End")
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(reorderFromNodeIdsMock).toHaveBeenNthCalledWith(3, ["el:12"], "forward")

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Home")
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(reorderFromNodeIdsMock).toHaveBeenNthCalledWith(4, ["el:1"], "forward")
  })

  it("extends row selection by page from the current anchor with Shift+PageDown", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    sidepanelTab.contentEl.clientHeight = 120
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: Array.from({ length: 12 }, (_, index) =>
        makeElementNode(`${index + 1}`, `Row ${index + 1}`),
      ),
      selectedIds: new Set(),
      sceneVersion: 31,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "Space")
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "PageDown")
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "PageDown", { shiftKey: true })
    await flushAsync()

    contentRoot = getContentRoot(sidepanelTab.contentEl)
    dispatchKeydown(contentRoot, "f")
    await flushAsync()

    expect(actions.reorderFromNodeIds).toHaveBeenCalledWith(
      Array.from({ length: 11 }, (_, index) => `el:${index + 1}`),
      "forward",
    )
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

  it("keeps keyboard review cursor inside a comfort band while navigating long row lists", async () => {
    const sidepanelTab = makeSidepanelTab(fakeDocument, null)
    sidepanelTab.contentEl.clientHeight = 120
    const { actions } = makeUiActions()

    const renderer = createExcalidrawSidepanelRenderer({
      sidepanelTab: sidepanelTab.tab,
      getScriptSettings: () => ({}),
    })

    if (!renderer) {
      throw new Error("Expected sidepanel renderer to be created in fake DOM test.")
    }

    renderer.render({
      tree: Array.from({ length: 12 }, (_, index) =>
        makeElementNode(`${index + 1}`, `Row ${index + 1}`),
      ),
      selectedIds: new Set(),
      sceneVersion: 32,
      actions,
    })

    let contentRoot = getContentRoot(sidepanelTab.contentEl)
    for (let step = 0; step < 7; step += 1) {
      dispatchKeydown(contentRoot, "ArrowDown")
      await flushAsync()
      contentRoot = getContentRoot(sidepanelTab.contentEl)
    }

    const viewportRect = sidepanelTab.contentEl.getBoundingClientRect()
    const focusedRowAfterDown = findFocusedInteractiveRow(contentRoot)
    if (!focusedRowAfterDown) {
      throw new Error("Expected a focused row after downward keyboard navigation.")
    }

    const focusedDownRect = focusedRowAfterDown.getBoundingClientRect()
    const scrollTopAfterDown = sidepanelTab.contentEl.scrollTop

    expect(scrollTopAfterDown).toBeGreaterThan(0)
    expect(focusedDownRect.top).toBeGreaterThan(viewportRect.top + 20)
    expect(focusedDownRect.bottom).toBeLessThan(viewportRect.bottom - 20)

    for (let step = 0; step < 5; step += 1) {
      dispatchKeydown(contentRoot, "ArrowUp")
      await flushAsync()
      contentRoot = getContentRoot(sidepanelTab.contentEl)
    }

    const focusedRowAfterUp = findFocusedInteractiveRow(contentRoot)
    if (!focusedRowAfterUp) {
      throw new Error("Expected a focused row after upward keyboard navigation.")
    }

    const focusedUpRect = focusedRowAfterUp.getBoundingClientRect()

    expect(sidepanelTab.contentEl.scrollTop).toBeLessThan(scrollTopAfterDown)
    expect(focusedUpRect.top).toBeGreaterThan(viewportRect.top + 20)
    expect(focusedUpRect.bottom).toBeLessThan(viewportRect.bottom - 20)
  })

  it("does not double-handle a single bubbled ArrowDown after rerender replaces the focused row tree", async () => {
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

    const contentRoot = getContentRoot(sidepanelTab.contentEl)
    const rowTreeRoot = findRowTreeRoot(contentRoot)
    if (!rowTreeRoot) {
      throw new Error("Expected row-tree root for keyboard navigation.")
    }

    const bubbledArrowEvent = new FakeDomEvent("keydown", { key: "ArrowDown" })
    bubbledArrowEvent.target = rowTreeRoot as unknown as EventTarget

    contentRoot.dispatchEvent(bubbledArrowEvent)
    fakeDocument.dispatchEvent(bubbledArrowEvent)
    await flushAsync()

    const refreshedRoot = getContentRoot(sidepanelTab.contentEl)
    const focusedRow = findFocusedInteractiveRow(refreshedRoot)
    if (!focusedRow) {
      throw new Error("Expected a focused row after bubbled keyboard navigation.")
    }

    expect((focusedRow as FakeDomElement & { ariaLabel?: string }).ariaLabel).toContain("B")
    expect((focusedRow as FakeDomElement & { ariaLabel?: string }).ariaLabel).not.toContain("C")
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
