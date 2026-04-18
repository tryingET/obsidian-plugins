import { describe, expect, it } from "vitest"

import { haveSameDragDropHint } from "../src/ui/excalidrawSidepanelRenderer.js"

describe("sidepanel drag-drop hint equality", () => {
  it("treats identical reorder hints as the same preview state", () => {
    expect(
      haveSameDragDropHint(
        {
          kind: "reorder",
          nodeId: "el:A",
          placement: "before",
        },
        {
          kind: "reorder",
          nodeId: "el:A",
          placement: "before",
        },
      ),
    ).toBe(true)
  })

  it("treats reorder hints for different nodes as distinct even when placement matches", () => {
    expect(
      haveSameDragDropHint(
        {
          kind: "reorder",
          nodeId: "el:A",
          placement: "before",
        },
        {
          kind: "reorder",
          nodeId: "el:B",
          placement: "before",
        },
      ),
    ).toBe(false)
  })

  it("treats reparent hints for different nodes as distinct", () => {
    expect(
      haveSameDragDropHint(
        {
          kind: "reparent",
          nodeId: "el:A",
        },
        {
          kind: "reparent",
          nodeId: "el:B",
        },
      ),
    ).toBe(false)
  })
})
