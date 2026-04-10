import { vi } from "vitest"

export interface FakeDomEventInit {
  key?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export class FakeDomEvent {
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

export class FakeDocument {
  activeElement: FakeDomElement | null = null
  defaultView = {
    HTMLElement: FakeDomElement,
  } as unknown as Window

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

export class FakeDomElement {
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

export interface SidepanelTabHarness {
  readonly tab: {
    contentEl?: HTMLElement
    setContent?: (content: HTMLElement | string) => void
    setTitle: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    getHostEA: () => unknown
  }
  readonly contentEl: FakeDomElement
  readonly setTitle: ReturnType<typeof vi.fn>
  readonly setContent: ReturnType<typeof vi.fn>
  readonly open: ReturnType<typeof vi.fn>
  readonly close: ReturnType<typeof vi.fn>
}

export type SidepanelMountMode = "contentEl" | "setContentOnly"

export const SIDEPANEL_MOUNT_MODE_CASES: readonly {
  readonly mountMode: SidepanelMountMode
  readonly label: string
}[] = [
  {
    mountMode: "contentEl",
    label: "contentEl",
  },
  {
    mountMode: "setContentOnly",
    label: "setContentOnly",
  },
]

export const makeSidepanelTab = (
  document: FakeDocument,
  hostEA: unknown,
  includeContentEl = true,
  includeSetContent = false,
): SidepanelTabHarness => {
  const contentEl = document.createElement("div")
  const setTitle = vi.fn()
  const open = vi.fn()
  const close = vi.fn()
  const setContent = vi.fn((content: HTMLElement | string) => {
    contentEl.innerHTML = ""

    if (typeof content === "string") {
      contentEl.innerHTML = content
      return
    }

    contentEl.appendChild(content as unknown as FakeDomElement)
  })

  const tabBase = {
    setTitle,
    open,
    close,
    getHostEA: () => hostEA,
  }

  const tab: SidepanelTabHarness["tab"] = {
    ...tabBase,
  }

  if (includeContentEl) {
    tab.contentEl = contentEl as unknown as HTMLElement
  }

  if (includeSetContent) {
    tab.setContent = setContent as (content: HTMLElement | string) => void
  }

  return {
    tab,
    contentEl,
    setTitle,
    setContent,
    open,
    close,
  }
}

export const makeSidepanelTabForMountMode = (
  document: FakeDocument,
  hostEA: unknown,
  mountMode: SidepanelMountMode,
): SidepanelTabHarness => {
  if (mountMode === "setContentOnly") {
    return makeSidepanelTab(document, hostEA, false, true)
  }

  return makeSidepanelTab(document, hostEA)
}

export const flattenElements = (root: FakeDomElement): FakeDomElement[] => {
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

export const getContentRoot = (contentEl: FakeDomElement): FakeDomElement => {
  const root = contentEl.children[0]
  if (!root) {
    throw new Error("Expected sidepanel content root to exist.")
  }

  return root
}

export const flushAsync = async (turns = 3): Promise<void> => {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve()
  }
}

export const getInteractiveRows = (contentRoot: FakeDomElement): FakeDomElement[] => {
  return flattenElements(contentRoot).filter(
    (element) => element.tagName === "DIV" && element.style["cursor"] === "pointer",
  )
}

export const getSelectedRows = (contentRoot: FakeDomElement): FakeDomElement[] => {
  return getInteractiveRows(contentRoot).filter((row) => (row.style["background"]?.length ?? 0) > 0)
}

export const dispatchClick = (element: FakeDomElement, init: FakeDomEventInit = {}): void => {
  element.dispatchEvent(new FakeDomEvent("click", init))
}

export interface DispatchKeydownOptions {
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  eventTarget?: FakeDomElement
}

type FakeDomEventReceiver = {
  dispatchEvent: (event: FakeDomEvent) => boolean
}

export const dispatchKeydown = (
  receiver: FakeDomEventReceiver,
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

export const dispatchDocumentKeydown = (
  receiver: FakeDocument,
  key: string,
  options: DispatchKeydownOptions = {},
): void => {
  dispatchKeydown(receiver, key, options)
}

export const findButtonByTitle = (
  root: FakeDomElement,
  title: string,
): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "BUTTON" && element.title === title)
}

export const findButtonByExactText = (
  root: FakeDomElement,
  label: string,
): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "BUTTON" && element.textContent === label)
}

export const findButtonWithPrefix = (
  root: FakeDomElement,
  prefix: string,
): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find(
    (element) =>
      element.tagName === "BUTTON" &&
      typeof element.textContent === "string" &&
      element.textContent.startsWith(prefix),
  )
}

const isRowFilterInput = (element: FakeDomElement): boolean => {
  return (element as FakeDomElement & { placeholder?: string }).placeholder === "Search layer rows"
}

export const findRowFilterInput = (root: FakeDomElement): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "INPUT" && isRowFilterInput(element))
}

export const findFirstInput = (root: FakeDomElement): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "INPUT" && !isRowFilterInput(element))
}

export const findFirstSelect = (root: FakeDomElement): FakeDomElement | undefined => {
  const elements = flattenElements(root)
  return elements.find((element) => element.tagName === "SELECT")
}

export const findRowTreeRoot = (root: FakeDomElement): FakeDomElement | undefined => {
  return flattenElements(root).find(
    (element) =>
      element.tagName === "DIV" && (element as FakeDomElement & { role?: string }).role === "tree",
  )
}

export const findInteractiveRowByLabel = (
  root: FakeDomElement,
  labelPrefix: string,
): FakeDomElement | undefined => {
  return flattenElements(root)
    .filter((element) => element.tagName === "DIV" && element.style["cursor"] === "pointer")
    .find(
      (row) =>
        typeof (row as FakeDomElement & { ariaLabel?: string }).ariaLabel === "string" &&
        (row as FakeDomElement & { ariaLabel: string }).ariaLabel.startsWith(labelPrefix),
    )
}

export const findFocusedInteractiveRow = (root: FakeDomElement): FakeDomElement | undefined => {
  return flattenElements(root)
    .filter((element) => element.tagName === "DIV" && element.style["cursor"] === "pointer")
    .find((row) => (row.style["outline"]?.length ?? 0) > 0)
}
