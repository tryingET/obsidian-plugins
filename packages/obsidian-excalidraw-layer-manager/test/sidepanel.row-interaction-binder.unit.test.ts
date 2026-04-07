import { describe, expect, it, vi } from "vitest"

import { bindSidepanelRowInteractions } from "../src/ui/sidepanel/render/rowInteractionBinder.js"

class FakeDomEvent {
  readonly type: string
  readonly key: string
  target: EventTarget | null = null
  relatedTarget: EventTarget | null = null
  defaultPrevented = false
  propagationStopped = false

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
  readonly ownerDocument: FakeDocument
  draggable = false
  parentElement: FakeDomElement | null = null

  #children: FakeDomElement[] = []
  #listeners = new Map<string, Set<(event: FakeDomEvent) => void>>()

  constructor(ownerDocument: FakeDocument) {
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

  contains(candidate: EventTarget | null): boolean {
    if (!candidate || typeof candidate !== "object") {
      return false
    }

    if (candidate === (this as unknown as EventTarget)) {
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
}

class FakeDocument {
  createElement(): FakeDomElement {
    return new FakeDomElement(this)
  }
}

describe("sidepanel row interaction binder", () => {
  it("binds click and double-click handlers with propagation guards", () => {
    const fakeDocument = new FakeDocument()
    const row = fakeDocument.createElement()

    const onRowClick = vi.fn<() => void>()
    const onRowDoubleClick = vi.fn<() => void>()

    bindSidepanelRowInteractions({
      row: row as unknown as HTMLDivElement,
      draggable: false,
      onRowClick,
      onRowDoubleClick,
      onDragStart: () => {},
      onDragEnd: () => {},
      onDragEnter: () => {},
      onDragOver: () => {},
      onDragLeave: () => {},
      onDrop: () => {},
    })

    const clickEvent = new FakeDomEvent("click")
    row.dispatchEvent(clickEvent)

    const dblClickEvent = new FakeDomEvent("dblclick")
    row.dispatchEvent(dblClickEvent)

    expect(onRowClick).toHaveBeenCalledTimes(1)
    expect(onRowDoubleClick).toHaveBeenCalledTimes(1)
    expect(clickEvent.propagationStopped).toBe(true)
    expect(dblClickEvent.defaultPrevented).toBe(true)
    expect(dblClickEvent.propagationStopped).toBe(true)
    expect(row.draggable).toBe(false)
  })

  it("does not bind drag listeners for non-draggable rows", () => {
    const fakeDocument = new FakeDocument()
    const row = fakeDocument.createElement()

    const onDragStart = vi.fn<(event: DragEvent) => void>()

    bindSidepanelRowInteractions({
      row: row as unknown as HTMLDivElement,
      draggable: false,
      onRowClick: () => {},
      onRowDoubleClick: () => {},
      onDragStart,
      onDragEnd: () => {},
      onDragEnter: () => {},
      onDragOver: () => {},
      onDragLeave: () => {},
      onDrop: () => {},
    })

    row.dispatchEvent(new FakeDomEvent("dragstart"))
    expect(onDragStart).not.toHaveBeenCalled()
    expect(row.draggable).toBe(false)
  })

  it("binds drag lifecycle handlers and drop guards for draggable rows", () => {
    const fakeDocument = new FakeDocument()
    const row = fakeDocument.createElement()

    const onDragStart = vi.fn<(event: DragEvent) => void>()
    const onDragEnd = vi.fn<() => void>()
    const onDragEnter = vi.fn<(event: DragEvent) => void>()
    const onDragOver = vi.fn<(event: DragEvent) => void>()
    const onDragLeave = vi.fn<(relatedTarget: HTMLElement | null) => void>()
    const onDrop = vi.fn<(event: DragEvent) => void>()

    bindSidepanelRowInteractions({
      row: row as unknown as HTMLDivElement,
      draggable: true,
      onRowClick: () => {},
      onRowDoubleClick: () => {},
      onDragStart,
      onDragEnd,
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    })

    const internalTarget = fakeDocument.createElement()
    row.appendChild(internalTarget)

    row.dispatchEvent(new FakeDomEvent("dragstart"))
    row.dispatchEvent(new FakeDomEvent("dragend"))
    row.dispatchEvent(new FakeDomEvent("dragenter"))
    row.dispatchEvent(new FakeDomEvent("dragover"))

    const dragLeaveEvent = new FakeDomEvent("dragleave")
    dragLeaveEvent.relatedTarget = internalTarget as unknown as EventTarget
    row.dispatchEvent(dragLeaveEvent)

    const dropEvent = new FakeDomEvent("drop")
    row.dispatchEvent(dropEvent)

    expect(row.draggable).toBe(true)
    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(onDragEnter).toHaveBeenCalledTimes(1)
    expect(onDragOver).toHaveBeenCalledTimes(1)
    expect(onDragLeave).toHaveBeenCalledTimes(1)
    expect(onDragLeave).toHaveBeenCalledWith(internalTarget)
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(dropEvent.defaultPrevented).toBe(true)
    expect(dropEvent.propagationStopped).toBe(true)
  })
})
