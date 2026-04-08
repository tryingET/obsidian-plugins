import { describe, expect, it, vi } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import type { GroupReparentPreset } from "../src/ui/sidepanel/quickmove/presetHelpers.js"
import { makePresetKey } from "../src/ui/sidepanel/quickmove/presetHelpers.js"
import type { LastQuickMoveDestination } from "../src/ui/sidepanel/quickmove/quickMovePersistenceService.js"
import { renderSidepanelQuickMove } from "../src/ui/sidepanel/render/quickMoveRenderer.js"

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

const findButtonWithPrefix = (root: FakeDomElement, prefix: string): FakeDomElement | undefined => {
  return flattenElements(root).find(
    (element) =>
      element.tagName === "BUTTON" &&
      typeof element.textContent === "string" &&
      element.textContent.startsWith(prefix),
  )
}

const findSelects = (root: FakeDomElement): FakeDomElement[] => {
  return flattenElements(root).filter((element) => element.tagName === "SELECT")
}

const flushAsync = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

const makeElementNode = (elementId: string, frameId: string | null = null): LayerNode => ({
  id: `el:${elementId}`,
  type: "element",
  elementIds: [elementId],
  primaryElementId: elementId,
  children: [],
  canExpand: false,
  isExpanded: false,
  groupId: null,
  frameId,
  label: elementId,
})

const makeGroupNode = (
  groupId: string,
  childNodes: readonly LayerNode[],
  frameId: string | null = null,
): LayerNode => ({
  id: `group:${groupId}`,
  type: "group",
  elementIds: childNodes.flatMap((child) => child.elementIds),
  primaryElementId: childNodes[0]?.primaryElementId ?? `${groupId}-primary`,
  children: childNodes,
  canExpand: true,
  isExpanded: true,
  groupId,
  frameId,
  label: groupId,
})

const createToolbarButton = (
  ownerDocument: Document,
  label: string,
  action: () => Promise<unknown>,
): HTMLButtonElement => {
  const button = (ownerDocument as unknown as FakeDocument).createElement("button")
  button.textContent = label
  button.addEventListener("click", () => {
    void action()
  })
  return button as unknown as HTMLButtonElement
}

const makeBaseInput = (
  document: FakeDocument,
  container: FakeDomElement,
  overrides: Partial<{
    tree: readonly LayerNode[]
    selection: { readonly elementIds: readonly string[]; readonly nodes: readonly LayerNode[] }
    lastQuickMoveDestination: LastQuickMoveDestination | null
    recentQuickMoveDestinations: readonly LastQuickMoveDestination[]
    onMoveSelectionToRoot: () => Promise<void>
    onApplyGroupPreset: (preset: GroupReparentPreset) => Promise<void>
    onNotify: (message: string) => void
  }> = {},
) => {
  const onMoveSelectionToRoot =
    overrides.onMoveSelectionToRoot ?? vi.fn<() => Promise<void>>(async () => {})
  const onApplyGroupPreset =
    overrides.onApplyGroupPreset ??
    vi.fn<(preset: GroupReparentPreset) => Promise<void>>(async () => {})
  const onNotify = overrides.onNotify ?? vi.fn<(message: string) => void>()

  return {
    container: container as unknown as HTMLElement,
    ownerDocument: document as unknown as Document,
    hasActions: true,
    tree: overrides.tree ?? [makeElementNode("A")],
    selection: overrides.selection ?? {
      elementIds: ["A"],
      nodes: [makeElementNode("A")],
    },
    lastQuickMoveDestination: overrides.lastQuickMoveDestination ?? null,
    recentQuickMoveDestinations: overrides.recentQuickMoveDestinations ?? [],
    quickPresetInlineMax: 4,
    quickPresetTotalMax: 24,
    allDestinationTotalMax: 48,
    lastMoveLabelMax: 26,
    createToolbarButton,
    onMoveSelectionToRoot,
    onApplyGroupPreset,
    onNotify,
  }
}

describe("sidepanel quick-move renderer", () => {
  it("renders root + top-level dropdown controls and routes callbacks", async () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    const onMoveSelectionToRoot = vi.fn(async () => {})
    const onApplyGroupPreset = vi.fn<(preset: GroupReparentPreset) => Promise<void>>(async () => {})
    const onNotify = vi.fn<(message: string) => void>()

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [
          makeElementNode("A"),
          makeGroupNode("G1", [makeElementNode("B")]),
          makeGroupNode("G2", [makeElementNode("C")]),
          makeGroupNode("G3", [makeElementNode("D")]),
          makeGroupNode("G4", [makeElementNode("E")]),
          makeGroupNode("G5", [makeElementNode("F")]),
        ],
        onMoveSelectionToRoot,
        onApplyGroupPreset,
        onNotify,
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement
    const rootButton = findButtonByText(renderedContainer, "Root")
    const moveButton = findButtonByText(renderedContainer, "Move")
    const selects = findSelects(renderedContainer)
    const topLevelSelect = selects[0]

    if (!rootButton || !moveButton || !topLevelSelect) {
      throw new Error("Expected root/dropdown quick-move controls to exist.")
    }

    expect(moveButton.disabled).toBe(true)

    rootButton.click()
    await flushAsync()

    expect(onMoveSelectionToRoot).toHaveBeenCalledTimes(1)

    const firstPresetOption = topLevelSelect.children.find(
      (child) => child.tagName === "OPTION" && child.value.length > 0,
    )

    if (!firstPresetOption) {
      throw new Error("Expected at least one selectable preset option.")
    }

    topLevelSelect.value = firstPresetOption.value
    topLevelSelect.dispatchEvent(new FakeDomEvent("change"))
    expect(moveButton.disabled).toBe(false)

    moveButton.click()
    await flushAsync()

    expect(onApplyGroupPreset).toHaveBeenCalledTimes(1)
    expect(onNotify).not.toHaveBeenCalled()

    const appliedPreset = onApplyGroupPreset.mock.calls[0]?.[0]
    expect(appliedPreset?.key).toBe(firstPresetOption.value)
  })

  it("renders repeat-last + inline presets and keeps last preset marked", async () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    const onMoveSelectionToRoot = vi.fn(async () => {})
    const onApplyGroupPreset = vi.fn<(preset: GroupReparentPreset) => Promise<void>>(async () => {})

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [
          makeElementNode("A", "F1"),
          makeGroupNode("G1", [makeElementNode("B", "F1")], "F1"),
          makeGroupNode("G2", [makeElementNode("C", "F1")], "F1"),
        ],
        selection: {
          elementIds: ["A"],
          nodes: [makeElementNode("A", "F1")],
        },
        lastQuickMoveDestination: {
          kind: "preset",
          preset: {
            key: "F1:G2",
            label: "Inside G2",
            targetParentPath: ["G2"],
            targetFrameId: "F1",
          },
        },
        onMoveSelectionToRoot,
        onApplyGroupPreset,
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement

    const repeatButton = findButtonWithPrefix(renderedContainer, "↺ Last:")
    const markedPresetButton = findButtonByText(renderedContainer, "Inside G2 ★")

    if (!repeatButton || !markedPresetButton) {
      throw new Error("Expected repeat-last and marked inline preset controls to exist.")
    }

    repeatButton.click()
    markedPresetButton.click()
    await flushAsync()

    expect(onMoveSelectionToRoot).not.toHaveBeenCalled()
    expect(onApplyGroupPreset).toHaveBeenCalledTimes(2)
    expect(onApplyGroupPreset.mock.calls[0]?.[0]?.key).toBe("F1:G2")
    expect(onApplyGroupPreset.mock.calls[1]?.[0]?.key).toBe("F1:G2")
  })

  it("renders recent targets plus a full destination picker", async () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    const onApplyGroupPreset = vi.fn<(preset: GroupReparentPreset) => Promise<void>>(async () => {})

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [
          makeElementNode("A", "F1"),
          makeGroupNode(
            "Outer",
            [makeGroupNode("Inner", [makeElementNode("B", "F1")], "F1")],
            "F1",
          ),
          makeGroupNode("G2", [makeElementNode("C", "F1")], "F1"),
        ],
        selection: {
          elementIds: ["A"],
          nodes: [makeElementNode("A", "F1")],
        },
        lastQuickMoveDestination: {
          kind: "preset",
          preset: {
            key: makePresetKey(["G2"], "F1"),
            label: "Inside G2",
            targetParentPath: ["G2"],
            targetFrameId: "F1",
          },
        },
        recentQuickMoveDestinations: [
          {
            kind: "preset",
            preset: {
              key: makePresetKey(["G2"], "F1"),
              label: "Inside G2",
              targetParentPath: ["G2"],
              targetFrameId: "F1",
            },
          },
          {
            kind: "preset",
            preset: {
              key: makePresetKey(["Outer", "Inner"], "F1"),
              label: "Inside Outer › Inner",
              targetParentPath: ["Outer", "Inner"],
              targetFrameId: "F1",
            },
          },
        ],
        onApplyGroupPreset,
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement
    const recentButton = findButtonByText(renderedContainer, "Inside Outer › Inner")
    const moveToPickedButton = findButtonByText(renderedContainer, "Move to picked")
    const selects = findSelects(renderedContainer)
    const pickerSelect = selects[0]

    if (!recentButton || !moveToPickedButton || !pickerSelect) {
      throw new Error("Expected recent-target and destination-picker controls to exist.")
    }

    recentButton.click()
    await flushAsync()

    expect(onApplyGroupPreset).toHaveBeenNthCalledWith(1, {
      key: makePresetKey(["Outer", "Inner"], "F1"),
      label: "Inside Outer › Inner",
      targetParentPath: ["Outer", "Inner"],
      targetFrameId: "F1",
    })

    const nestedOption = pickerSelect.children.find(
      (child) =>
        child.tagName === "OPTION" && child.value === makePresetKey(["Outer", "Inner"], "F1"),
    )

    if (!nestedOption) {
      throw new Error("Expected nested destination option to exist in picker.")
    }

    pickerSelect.value = nestedOption.value
    pickerSelect.dispatchEvent(new FakeDomEvent("change"))
    moveToPickedButton.click()
    await flushAsync()

    expect(onApplyGroupPreset).toHaveBeenNthCalledWith(2, {
      key: makePresetKey(["Outer", "Inner"], "F1"),
      label: "Inside Outer › Inner",
      targetParentPath: ["Outer", "Inner"],
      targetFrameId: "F1",
    })
  })

  it("skips rendering when actions are unavailable", () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    const rendered = renderSidepanelQuickMove({
      ...makeBaseInput(document, container),
      hasActions: false,
    })

    expect(rendered).toBeNull()
    expect(container.children).toHaveLength(0)
  })
})
