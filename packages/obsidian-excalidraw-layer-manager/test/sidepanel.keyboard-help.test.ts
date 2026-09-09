import { describe, expect, it } from "vitest"
import { SidepanelKeyboardHelp } from "../src/ui/sidepanel/render/keyboardHelp.js"
import { FakeDocument, type FakeDomElement, FakeDomEvent } from "./sidepanelTestHarness.js"

function fixture(id = "help-one", doc = new FakeDocument()) {
  const help = new SidepanelKeyboardHelp(id)
  const render = (owner = doc) =>
    help.render(
      owner as unknown as Document,
      () => owner.createElement("span") as unknown as HTMLElement,
    )
  const elements = render()
  const button = elements.button as unknown as FakeDomElement & {
    ariaExpanded: string
  }
  const panel = elements.panel as unknown as FakeDomElement
  return { help, render, button, panel, doc }
}

describe("Given an on-demand native help disclosure", () => {
  it("When mounted Then exposes named native controls and a focusable scrolling region", () => {
    const { button, panel } = fixture()
    expect(button.tagName).toBe("BUTTON")
    expect(button.getAttribute("aria-controls")).toBe(panel.id)
    expect(button.ariaExpanded).toBe("false")
    expect(panel.style["display"]).toBe("none")
    expect(panel.tabIndex).toBe(0)
    expect(panel.style["overflowY"]).toBe("auto")
    button.click()
    expect(button.ariaExpanded).toBe("true")
    expect(panel.style["display"]).toBe("block")
  })
  it.each(["Enter", " ", "ArrowDown", "PageDown", "Delete", "g", "Tab"])(
    "When %s is pressed in help Then isolate layer commands without cancelling native defaults",
    (key) => {
      const { button, panel } = fixture()
      for (const target of [button, panel])
        for (const type of ["keydown", "keypress", "keyup"]) {
          const event = new FakeDomEvent(type, { key })
          target.dispatchEvent(event)
          expect(event.propagationStopped).toBe(true)
          expect(event.defaultPrevented).toBe(false)
        }
    },
  )
  it("When Escape closes focused content Then return focus to the disclosure button", () => {
    const { button, panel, doc } = fixture()
    button.click()
    panel.focus()
    const escapeEvent = new FakeDomEvent("keydown", { key: "Escape" })
    panel.dispatchEvent(escapeEvent)
    expect(escapeEvent.defaultPrevented).toBe(true)
    expect(button.ariaExpanded).toBe("false")
    expect(doc.activeElement).toBe(button)
  })
  it("When the same view refreshes Then reuse DOM and reading position without stealing outside focus", () => {
    const { help, button, panel, doc, render } = fixture()
    const root = doc.createElement("div")
    root.appendChild(button)
    root.appendChild(panel)
    button.click()
    panel.scrollTop = 70
    panel.focus()
    expect(help.beforeRender(root as unknown as HTMLElement)).toBe(true)
    doc.activeElement = null
    expect(render().panel).toBe(panel)
    help.restoreFocus()
    expect(doc.activeElement).toBe(panel)
    expect(panel.scrollTop).toBe(70)
    const outside = doc.createElement("input")
    outside.focus()
    expect(help.beforeRender(root as unknown as HTMLElement)).toBe(false)
    help.restoreFocus()
    expect(doc.activeElement).toBe(outside)
  })
  it("When ownership migrates or resets Then detach old listeners and start collapsed in the new document", () => {
    const { help, button, render } = fixture()
    button.click()
    const nextDoc = new FakeDocument()
    const next = render(nextDoc)
    expect(next.button.ownerDocument).toBe(nextDoc)
    expect(next.button.ariaExpanded).toBe("false")
    const event = new FakeDomEvent("keydown", { key: "Escape" })
    button.dispatchEvent(event)
    expect(event.propagationStopped).toBe(false)
    expect(help.ownsTarget(button as unknown as EventTarget)).toBe(false)
    help.reset()
    expect(help.ownsTarget(next.button)).toBe(false)
    expect(render(nextDoc).button).not.toBe(next.button)
  })
  it("When two instances share a document Then each disclosure controls only its own panel", () => {
    const doc = new FakeDocument()
    const first = fixture("help-one", doc),
      second = fixture("help-two", doc)
    expect(first.button.getAttribute("aria-controls")).not.toBe(
      second.button.getAttribute("aria-controls"),
    )
    expect(first.help.ownsTarget(second.button as unknown as EventTarget)).toBe(false)
    first.button.click()
    expect(second.button.ariaExpanded).toBe("false")
  })
})
