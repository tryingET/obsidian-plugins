import { describe, expect, it, vi } from "vitest"

import type { LayerNode } from "../src/model/tree.js"
import { buildSidepanelQuickMoveDestinationProjection } from "../src/ui/sidepanel/quickmove/destinationProjection.js"
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
  label = groupId,
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
  label,
})

const makeFrameNode = (frameId: string, childNodes: readonly LayerNode[]): LayerNode => ({
  id: `frame:${frameId}`,
  type: "frame",
  elementIds: [frameId, ...childNodes.flatMap((child) => child.elementIds)],
  primaryElementId: frameId,
  children: childNodes,
  canExpand: childNodes.length > 0,
  isExpanded: true,
  groupId: null,
  frameId: null,
  label: frameId,
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

const makeFrameResolution = (frameId: string | null) => ({
  ok: true as const,
  frameId,
})

const makeBaseInput = (
  document: FakeDocument,
  container: FakeDomElement,
  overrides: Partial<{
    tree: readonly LayerNode[]
    selection: {
      readonly elementIds: readonly string[]
      readonly nodes: readonly LayerNode[]
      readonly frameResolution: { readonly ok: true; readonly frameId: string | null }
    }
    reviewScope: {
      readonly active: boolean
      readonly matchingRowCount: number
      readonly contextRowCount: number
    }
    lastQuickMoveDestination: LastQuickMoveDestination | null
    recentQuickMoveDestinations: readonly LastQuickMoveDestination[]
    quickPresetInlineMax: number
    quickPresetTotalMax: number
    allDestinationTotalMax: number
    onMoveSelectionToRoot: (targetFrameId: string | null) => Promise<void>
    onApplyGroupPreset: (preset: GroupReparentPreset) => Promise<void>
    onNotify: (message: string) => void
  }> = {},
) => {
  const onMoveSelectionToRoot =
    overrides.onMoveSelectionToRoot ??
    vi.fn<(targetFrameId: string | null) => Promise<void>>(async () => {})
  const onApplyGroupPreset =
    overrides.onApplyGroupPreset ??
    vi.fn<(preset: GroupReparentPreset) => Promise<void>>(async () => {})
  const onNotify = overrides.onNotify ?? vi.fn<(message: string) => void>()
  const tree = overrides.tree ?? [makeElementNode("A")]
  const quickPresetTotalMax = overrides.quickPresetTotalMax ?? 24
  const allDestinationTotalMax = overrides.allDestinationTotalMax ?? 48

  return {
    container: container as unknown as HTMLElement,
    ownerDocument: document as unknown as Document,
    hasActions: true,
    selection: overrides.selection ?? {
      elementIds: ["A"],
      nodes: [makeElementNode("A")],
      frameResolution: makeFrameResolution(null),
    },
    reviewScope: overrides.reviewScope ?? {
      active: false,
      matchingRowCount: 0,
      contextRowCount: 0,
    },
    destinationProjection: buildSidepanelQuickMoveDestinationProjection(
      tree,
      quickPresetTotalMax,
      allDestinationTotalMax,
    ),
    lastQuickMoveDestination: overrides.lastQuickMoveDestination ?? null,
    recentQuickMoveDestinations: overrides.recentQuickMoveDestinations ?? [],
    quickPresetInlineMax: overrides.quickPresetInlineMax ?? 4,
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

    const onMoveSelectionToRoot = vi.fn<(targetFrameId: string | null) => Promise<void>>(
      async () => {},
    )
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
    expect(onMoveSelectionToRoot).toHaveBeenCalledWith(null)

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

    const onMoveSelectionToRoot = vi.fn<(targetFrameId: string | null) => Promise<void>>(
      async () => {},
    )
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
          frameResolution: makeFrameResolution("F1"),
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
          frameResolution: makeFrameResolution("F1"),
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

  it("projects persisted destinations onto live labels and hides stale presets", () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [makeGroupNode("G", [makeElementNode("A")], null, "Renamed Group")],
        lastQuickMoveDestination: {
          kind: "preset",
          preset: {
            key: makePresetKey(["G"], null),
            label: "Inside G",
            targetParentPath: ["G"],
            targetFrameId: null,
          },
        },
        recentQuickMoveDestinations: [
          {
            kind: "preset",
            preset: {
              key: makePresetKey(["missing"], null),
              label: "Inside missing",
              targetParentPath: ["missing"],
              targetFrameId: null,
            },
          },
        ],
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement

    expect(findButtonByText(renderedContainer, "Inside missing")).toBeUndefined()

    const repeatButton = findButtonWithPrefix(renderedContainer, "↺ Last:")
    expect(repeatButton).toBeDefined()
    expect(repeatButton?.textContent).toContain("Renamed")
  })

  it("disables structural quick-move controls when selection includes frame rows", () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [makeFrameNode("F1", [makeGroupNode("G1", [makeElementNode("A", "F1")], "F1")])],
        selection: {
          elementIds: ["F1"],
          nodes: [makeFrameNode("F1", [makeElementNode("A", "F1")])],
          frameResolution: makeFrameResolution("F1"),
        },
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement
    const rootButton = findButtonByText(renderedContainer, "Root")
    const presetButton = findButtonByText(renderedContainer, "Inside G1")

    expect(rootButton?.disabled).toBe(true)
    expect(rootButton?.title).toBe("Selection includes frame rows.")
    expect(presetButton?.disabled).toBe(true)
    expect(presetButton?.title).toBe("Selection includes frame rows.")
  })

  it("disables repeat-last root when it points at a different frame root", () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [makeFrameNode("F1", []), makeFrameNode("F2", [makeElementNode("A", "F2")])],
        selection: {
          elementIds: ["A"],
          nodes: [makeElementNode("A", "F2")],
          frameResolution: makeFrameResolution("F2"),
        },
        lastQuickMoveDestination: {
          kind: "root",
          targetFrameId: "F1",
        },
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement
    const repeatButton = findButtonWithPrefix(renderedContainer, "↺ Last:")

    if (!repeatButton) {
      throw new Error("Expected repeat-last control to exist.")
    }

    expect(repeatButton.disabled).toBe(true)
    expect(repeatButton.title).toBe("Last destination is in a different frame.")
    expect(findButtonByText(renderedContainer, "Root ★")).toBeUndefined()
  })

  it("renders recent root destinations with distinct labels and replays the remembered root target", async () => {
    const document = new FakeDocument()
    const container = document.createElement("div")
    const onMoveSelectionToRoot = vi.fn<(targetFrameId: string | null) => Promise<void>>(
      async () => {},
    )

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [makeFrameNode("F1", [makeElementNode("A", "F1")]), makeFrameNode("F2", [])],
        selection: {
          elementIds: ["A"],
          nodes: [makeElementNode("A", "F1")],
          frameResolution: makeFrameResolution("F1"),
        },
        lastQuickMoveDestination: {
          kind: "preset",
          preset: {
            key: makePresetKey(["G1"], "F1"),
            label: "Inside G1",
            targetParentPath: ["G1"],
            targetFrameId: "F1",
          },
        },
        recentQuickMoveDestinations: [
          { kind: "root", targetFrameId: "F1" },
          { kind: "root", targetFrameId: "F2" },
        ],
        onMoveSelectionToRoot,
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement
    const frameOneRootButton = findButtonByText(renderedContainer, "Frame root: F1")
    const frameTwoRootButton = findButtonByText(renderedContainer, "Frame root: F2")

    expect(frameOneRootButton).toBeDefined()
    expect(frameTwoRootButton).toBeDefined()
    expect(frameTwoRootButton?.disabled).toBe(true)

    frameOneRootButton?.click()
    await flushAsync()

    expect(onMoveSelectionToRoot).toHaveBeenCalledWith("F1")
  })

  it("prioritizes compatible recent destinations so they are not hidden behind incompatible recents", () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [
          makeFrameNode("F1", [makeGroupNode("G1", [makeElementNode("A", "F1")], "F1", "Keep")]),
          makeFrameNode("F2", [
            makeGroupNode("G2", [makeElementNode("B", "F2")], "F2", "Elsewhere"),
          ]),
        ],
        selection: {
          elementIds: ["A"],
          nodes: [makeElementNode("A", "F1")],
          frameResolution: makeFrameResolution("F1"),
        },
        recentQuickMoveDestinations: [
          { kind: "root", targetFrameId: "F2" },
          {
            kind: "preset",
            preset: {
              key: makePresetKey(["G2"], "F2"),
              label: "Inside Elsewhere",
              targetParentPath: ["G2"],
              targetFrameId: "F2",
            },
          },
          {
            kind: "preset",
            preset: {
              key: makePresetKey(["G1"], "F1"),
              label: "Inside Keep",
              targetParentPath: ["G1"],
              targetFrameId: "F1",
            },
          },
        ],
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement

    expect(findButtonByText(renderedContainer, "Inside Keep")).toBeDefined()
  })

  it("keeps remembered destinations available in the picker when the base list is capped", () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [
          makeElementNode("A", "F1"),
          makeGroupNode("G1", [makeElementNode("B", "F1")], "F1"),
          makeGroupNode("G2", [makeElementNode("C", "F1")], "F1"),
          makeGroupNode("G3", [makeElementNode("D", "F1")], "F1"),
        ],
        selection: {
          elementIds: ["A"],
          nodes: [makeElementNode("A", "F1")],
          frameResolution: makeFrameResolution("F1"),
        },
        lastQuickMoveDestination: {
          kind: "preset",
          preset: {
            key: makePresetKey(["G3"], "F1"),
            label: "Inside G3",
            targetParentPath: ["G3"],
            targetFrameId: "F1",
          },
        },
        allDestinationTotalMax: 1,
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement
    const selects = findSelects(renderedContainer)
    const pickerSelect = selects.at(-1)

    if (!pickerSelect) {
      throw new Error("Expected destination picker to exist.")
    }

    const rememberedOption = pickerSelect.children.find(
      (child) => child.tagName === "OPTION" && child.value === makePresetKey(["G3"], "F1"),
    )

    expect(rememberedOption).toBeDefined()
  })

  it("surfaces review-scope copy and richer destination context for board-scale quick moves", () => {
    const document = new FakeDocument()
    const container = document.createElement("div")

    renderSidepanelQuickMove(
      makeBaseInput(document, container, {
        tree: [
          makeFrameNode("F1", [
            makeGroupNode(
              "Outer",
              [makeGroupNode("Inner", [makeElementNode("A", "Alpha")], "F1", "Inner")],
              "F1",
              "Outer",
            ),
            makeGroupNode("Archive", [makeElementNode("B", "Beta")], "F1", "Archive"),
          ]),
        ],
        selection: {
          elementIds: ["A"],
          nodes: [makeElementNode("A", "Alpha")],
          frameResolution: makeFrameResolution("F1"),
        },
        reviewScope: {
          active: true,
          matchingRowCount: 1,
          contextRowCount: 1,
        },
        lastQuickMoveDestination: {
          kind: "preset",
          preset: {
            key: makePresetKey(["Outer", "Inner"], "F1"),
            label: "Inside Outer › Inner",
            targetParentPath: ["Outer", "Inner"],
            targetFrameId: "F1",
          },
        },
      }),
    )

    const renderedContainer = container as unknown as FakeDomElement
    const reviewMoveTitle = flattenElements(renderedContainer).find(
      (element) =>
        element.tagName === "SPAN" && element.textContent === "Move selection from review scope:",
    )
    const reviewDestinationsTitle = flattenElements(renderedContainer).find(
      (element) => element.tagName === "SPAN" && element.textContent === "Review destinations:",
    )
    const repeatButton = findButtonWithPrefix(renderedContainer, "↺ Last:")
    const pickerSelect = findSelects(renderedContainer).at(-1)

    if (!reviewMoveTitle || !reviewDestinationsTitle || !repeatButton || !pickerSelect) {
      throw new Error("Expected review-scope quick-move controls to exist.")
    }

    const rememberedOption = pickerSelect.children.find(
      (child) =>
        child.tagName === "OPTION" && child.value === makePresetKey(["Outer", "Inner"], "F1"),
    )

    expect(reviewMoveTitle.title).toContain("Filtered review scope")
    expect(reviewMoveTitle.title).toContain("1 context row")
    expect(reviewDestinationsTitle.title).toContain("canonical selected rows")
    expect(repeatButton.title).toContain("frame F1")
    expect(repeatButton.title).toContain("path Outer / Inner")
    expect(pickerSelect.title).toContain("Review-scope destination picker")
    expect(rememberedOption?.textContent).toBe("Inside Outer › Inner · frame F1 ★")
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
