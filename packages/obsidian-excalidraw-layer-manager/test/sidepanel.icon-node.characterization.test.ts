import { describe, expect, it, vi } from "vitest"

import { createExcalidrawLikeIconNode } from "../src/ui/sidepanel/render/excalidrawIconNode.js"
import { FakeDocument, type FakeDomElement } from "./sidepanelTestHarness.js"

// Minimal namespace-aware DOM double: retain the actual emitted attributes and children.
class SvgNode {
  readonly attributes = new Map<string, string>()
  readonly children: SvgNode[] = []
  constructor(
    readonly namespace: string,
    readonly tag: string,
  ) {}
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }
  appendChild(child: SvgNode): SvgNode {
    this.children.push(child)
    return child
  }
}

const svgDocument = () => ({
  createElementNS: vi.fn((namespace: string, tag: string) => new SvgNode(namespace, tag)),
})

describe("Excalidraw icon node characterization", () => {
  it("returns null for an unknown icon without allocating a DOM node", () => {
    const document = svgDocument()
    expect(
      createExcalidrawLikeIconNode(document as unknown as Document, "unknown-icon", "?", 16),
    ).toBeNull()
    expect(document.createElementNS).not.toHaveBeenCalled()
  })

  it.each(["absent", "nonfunction"])(
    "renders a sized fallback when createElementNS is %s",
    (mode) => {
      const document = new FakeDocument()
      if (mode === "nonfunction") Object.assign(document, { createElementNS: null })
      const node = createExcalidrawLikeIconNode(
        document as unknown as Document,
        "eye",
        "Visible",
        18,
      ) as unknown as FakeDomElement
      expect(node.tagName).toBe("SPAN")
      expect(node.textContent).toBe("Visible")
      expect(node.style).toEqual({
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "18px",
        height: "18px",
        fontSize: "18px",
        lineHeight: "1",
      })
    },
  )

  it.each([
    ["eye", "1.5", 2],
    ["lock", "1.25", 3],
    ["eye-off", "1.5", 3],
  ] as const)(
    "renders %s as decorative SVG with its stroke and path geometry",
    (icon, strokeWidth, pathCount) => {
      const document = svgDocument()
      const node = createExcalidrawLikeIconNode(
        document as unknown as Document,
        icon,
        "fallback",
        20,
      ) as unknown as SvgNode
      expect(node.namespace).toBe("http://www.w3.org/2000/svg")
      expect(node.tag).toBe("svg")
      expect(Object.fromEntries(node.attributes)).toEqual({
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": strokeWidth,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        width: "20",
        height: "20",
        "aria-hidden": "true",
        focusable: "false",
      })
      expect(node.children).toHaveLength(pathCount)
      expect(document.createElementNS).toHaveBeenCalledTimes(pathCount + 1)
      for (const path of node.children) {
        expect(path.namespace).toBe(node.namespace)
        expect(path.tag).toBe("path")
        expect(path.attributes.get("d")).toMatch(/^M/)
        expect(path.attributes.get("fill")).toBe("none")
        expect(path.attributes.get("stroke")).toBe("currentColor")
        expect(path.attributes.has("stroke-width")).toBe(false)
        expect(path.attributes.has("transform")).toBe(false)
      }
      if (icon === "eye") {
        expect(node.children.map((path) => path.attributes.get("d"))).toEqual([
          "M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0",
          "M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6",
        ])
      }
    },
  )

  it.each(["zindex-send-backward", "zindex-send-to-back"])(
    "rotates every %s path around the icon center",
    (icon) => {
      const document = svgDocument()
      const node = createExcalidrawLikeIconNode(
        document as unknown as Document,
        icon,
        "back",
        16,
      ) as unknown as SvgNode
      expect(node.children).toHaveLength(icon === "zindex-send-backward" ? 3 : 4)
      for (const path of node.children) {
        expect(path.attributes.get("transform")).toBe("rotate(180 12 12)")
      }
    },
  )
})
