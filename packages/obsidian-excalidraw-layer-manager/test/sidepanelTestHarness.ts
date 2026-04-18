import { vi } from "vitest"

export interface FakeDomEventInit {
  key?: string
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export class FakeDomEvent {
  readonly type: string
  readonly key: string
  readonly code: string
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
    this.code = init.code ?? ""
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

interface FakeDomClientRectLike {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
  readonly right: number
  readonly bottom: number
  toJSON?: () => Record<string, number>
}

const parsePixelValue = (value: string | undefined): number => {
  if (!value) {
    return 0
  }

  const numeric = Number.parseFloat(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const parseBoxShorthand = (
  value: string | undefined,
): readonly [number, number, number, number] => {
  if (!value || value.trim().length === 0) {
    return [0, 0, 0, 0]
  }

  const parts = value
    .trim()
    .split(/\s+/)
    .map((entry) => parsePixelValue(entry))

  if (parts.length === 1) {
    return [parts[0] ?? 0, parts[0] ?? 0, parts[0] ?? 0, parts[0] ?? 0]
  }

  if (parts.length === 2) {
    return [parts[0] ?? 0, parts[1] ?? 0, parts[0] ?? 0, parts[1] ?? 0]
  }

  if (parts.length === 3) {
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[1] ?? 0]
  }

  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0]
}

export class FakeDocument {
  activeElement: FakeDomElement | null = null
  /** Simulate browser focus-scroll for regression tests when preventScroll is missing. */
  focusScrollDelta = 0
  /** Simulate host runtimes that ignore preventScroll on focus(). */
  ignorePreventScrollOnFocus = false
  /** Simulate host focus behavior that snaps the nearest scroll container back to top. */
  focusScrollsAncestorToTop = false
  /** Defer synthetic focus scroll until the microtask queue drains. */
  deferFocusScrollToMicrotask = false
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
  placeholder = ""
  id = ""
  parentElement: FakeDomElement | null = null
  scrollTop = 0
  clientHeight = 0
  clientWidth = 0

  #children: FakeDomElement[] = []
  #listeners = new Map<string, Set<(event: FakeDomEvent) => void>>()
  #explicitScrollHeight: number | null = null
  #explicitClientRect: FakeDomClientRectLike | null = null

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
  }

  get children(): readonly FakeDomElement[] {
    return this.#children
  }

  get scrollHeight(): number {
    if (this.#explicitScrollHeight !== null) {
      return this.#explicitScrollHeight
    }

    return Math.max(this.resolveLayoutHeight(), this.resolveAutoHeight())
  }

  set scrollHeight(value: number) {
    this.#explicitScrollHeight = value
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

  focus(options?: FocusOptions): void {
    this.ownerDocument.activeElement = this

    if (options?.preventScroll === true && !this.ownerDocument.ignorePreventScrollOnFocus) {
      return
    }

    const applyFocusScroll = (): void => {
      const focusScrollDelta = this.ownerDocument.focusScrollDelta
      let current: FakeDomElement | null = this.parentElement
      while (current) {
        if (current.clientHeight > 0 && current.scrollHeight > current.clientHeight + 1) {
          if (this.ownerDocument.focusScrollsAncestorToTop) {
            current.scrollTop = 0
            return
          }

          if (focusScrollDelta !== 0) {
            current.scrollTop += focusScrollDelta
          }
          return
        }

        current = current.parentElement
      }
    }

    if (this.ownerDocument.deferFocusScrollToMicrotask) {
      Promise.resolve().then(() => {
        applyFocusScroll()
      })
      return
    }

    applyFocusScroll()
  }

  scrollIntoView(): void {
    // no-op for the fake harness; tests inspect scrollTop and geometry directly
  }

  getBoundingClientRect(): FakeDomClientRectLike {
    if (this.#explicitClientRect) {
      return this.#explicitClientRect
    }

    const height = this.resolveLayoutHeight()
    const width = this.clientWidth

    if (!this.parentElement) {
      return this.makeClientRect(0, 0, width, height)
    }

    const parentRect = this.parentElement.getBoundingClientRect()
    const top = parentRect.top + this.resolveOffsetWithinParent() - this.parentElement.scrollTop
    return this.makeClientRect(top, parentRect.left, width, height)
  }

  set innerHTML(value: string) {
    this.#children = []
    this.textContent = value
  }

  get innerHTML(): string {
    return this.textContent ?? ""
  }

  private makeClientRect(
    top: number,
    left: number,
    width: number,
    height: number,
  ): FakeDomClientRectLike {
    return {
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({
        top,
        left,
        width,
        height,
        right: left + width,
        bottom: top + height,
      }),
    }
  }

  private resolveLayoutHeight(): number {
    const explicitHeight = parsePixelValue(this.style["height"])
    const minHeight = parsePixelValue(this.style["minHeight"])
    const baseHeight = this.clientHeight > 0 ? this.clientHeight : explicitHeight
    const autoHeight = baseHeight > 0 ? baseHeight : this.resolveAutoHeight()
    return Math.max(autoHeight, minHeight)
  }

  private resolveAutoHeight(): number {
    const [paddingTop, , paddingBottom] = parseBoxShorthand(this.style["padding"])

    if (this.#children.length === 0) {
      return this.resolveLeafHeight() + paddingTop + paddingBottom
    }

    const gap = parsePixelValue(this.style["gap"])
    const isRowFlex = this.style["display"] === "flex" && this.style["flexDirection"] !== "column"

    if (isRowFlex) {
      const tallestChild = this.#children.reduce((maxHeight, child) => {
        return Math.max(maxHeight, child.resolveLayoutHeight())
      }, 0)

      return tallestChild + paddingTop + paddingBottom
    }

    let childHeight = 0
    for (const [index, child] of this.#children.entries()) {
      childHeight += child.resolveOuterHeight()
      if (index < this.#children.length - 1) {
        childHeight += gap
      }
    }

    return childHeight + paddingTop + paddingBottom
  }

  private resolveLeafHeight(): number {
    switch (this.tagName) {
      case "INPUT":
      case "SELECT":
        return 24
      case "BUTTON":
        return 20
      default:
        break
    }

    if (this.style["cursor"] === "pointer") {
      return parsePixelValue(this.style["minHeight"]) || 20
    }

    if ((this.textContent?.length ?? 0) > 0) {
      return 16
    }

    return 0
  }

  private resolveOuterHeight(): number {
    const marginTop = parsePixelValue(this.style["marginTop"])
    const marginBottom = parsePixelValue(this.style["marginBottom"])
    return this.resolveLayoutHeight() + marginTop + marginBottom
  }

  private resolveOffsetWithinParent(): number {
    const parent = this.parentElement
    if (!parent) {
      return 0
    }

    const [paddingTop] = parseBoxShorthand(parent.style["padding"])
    const gap = parsePixelValue(parent.style["gap"])
    let offset = paddingTop + parsePixelValue(this.style["marginTop"])

    for (const sibling of parent.children) {
      if (sibling === this) {
        break
      }

      offset += sibling.resolveOuterHeight() + gap
    }

    return offset
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

export const flushAsync = async (turns = 6): Promise<void> => {
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
  code?: string
  eventTarget?: FakeDomElement
}

type FakeDomEventReceiver = {
  dispatchEvent: (event: FakeDomEvent) => boolean
}

const buildKeyboardEventInit = (
  key: string,
  options: DispatchKeydownOptions = {},
): FakeDomEventInit => {
  const init: FakeDomEventInit = {
    key,
  }

  if (options.code !== undefined) {
    init.code = options.code
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

  return init
}

export const dispatchKeydown = (
  receiver: FakeDomEventReceiver,
  key: string,
  options: DispatchKeydownOptions = {},
): void => {
  const event = new FakeDomEvent("keydown", buildKeyboardEventInit(key, options))

  if (options.eventTarget) {
    event.target = options.eventTarget as unknown as EventTarget
  }

  receiver.dispatchEvent(event)
}

export const dispatchKeyup = (
  receiver: FakeDomEventReceiver,
  key: string,
  options: DispatchKeydownOptions = {},
): void => {
  const event = new FakeDomEvent("keyup", buildKeyboardEventInit(key, options))

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

export const dispatchDocumentKeyup = (
  receiver: FakeDocument,
  key: string,
  options: DispatchKeydownOptions = {},
): void => {
  dispatchKeyup(receiver, key, options)
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
