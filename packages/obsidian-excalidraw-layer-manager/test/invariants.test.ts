import { describe, expect, it } from "vitest"

import { validateReparentInvariants } from "../src/domain/invariants.js"

describe("validateReparentInvariants", () => {
  it("rejects cross-frame moves", () => {
    const result = validateReparentInvariants({
      sourceFrameId: "frame-a",
      targetFrameId: "frame-b",
      sourceGroupId: null,
      targetParentPath: [],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("Cross-frame")
    }
  })

  it("rejects self-nesting cycles", () => {
    const result = validateReparentInvariants({
      sourceFrameId: null,
      targetFrameId: null,
      sourceGroupId: "group-1",
      targetParentPath: ["group-1", "group-2"],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("itself")
    }
  })

  it("rejects duplicate target path segments", () => {
    const result = validateReparentInvariants({
      sourceFrameId: null,
      targetFrameId: null,
      sourceGroupId: null,
      targetParentPath: ["dup", "dup"],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("duplicate")
    }
  })

  it("rejects stale canonical target parent paths", () => {
    const result = validateReparentInvariants({
      sourceFrameId: "frame-1",
      targetFrameId: "frame-1",
      sourceGroupId: null,
      targetParentPath: ["missing"],
      canonicalTargetParentPathKeys: new Set(["null:", "frame-1:"]),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("stale")
    }
  })

  it("accepts valid same-frame reparent", () => {
    const result = validateReparentInvariants({
      sourceFrameId: "frame-1",
      targetFrameId: "frame-1",
      sourceGroupId: "group-1",
      targetParentPath: ["group-2"],
      canonicalTargetParentPathKeys: new Set(["null:", "frame-1:", "frame-1:group-2"]),
    })

    expect(result.ok).toBe(true)
  })
})
