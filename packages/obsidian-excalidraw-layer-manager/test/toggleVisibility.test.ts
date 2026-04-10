import { describe, expect, it } from "vitest"

import { planToggleVisibility } from "../src/commands/toggleVisibility.js"
import { makeCommandContext, makeElement } from "./testFixtures.js"

describe("planToggleVisibility", () => {
  it("hides visible elements by setting opacity to 0 and storing originalOpacity", () => {
    const context = makeCommandContext([
      makeElement({ id: "a", opacity: 80 }),
      makeElement({ id: "b", opacity: 100 }),
    ])

    const plan = planToggleVisibility(context, { elementIds: ["a", "b"] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    const [firstPatch] = plan.value.elementPatches
    expect(firstPatch?.set.opacity).toBe(0)
    expect(firstPatch?.set.customData?.originalOpacity).toBe(80)
  })

  it("restores hidden elements to previous opacity", () => {
    const context = makeCommandContext([
      makeElement({
        id: "a",
        opacity: 0,
        customData: { originalOpacity: 67 },
      }),
    ])

    const plan = planToggleVisibility(context, { elementIds: ["a"] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.elementPatches[0]?.set.opacity).toBe(67)
  })

  it("restores only hidden members in a mixed selection and preserves visible opacity", () => {
    const context = makeCommandContext([
      makeElement({ id: "visible", opacity: 40 }),
      makeElement({
        id: "hidden",
        opacity: 0,
        customData: { originalOpacity: 55 },
      }),
    ])

    const plan = planToggleVisibility(context, { elementIds: ["visible", "hidden"] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.elementPatches).toEqual([
      {
        id: "hidden",
        set: {
          opacity: 55,
          customData: {},
        },
      },
    ])
  })

  it("restores hidden members without originalOpacity to full opacity during mixed selection restore", () => {
    const context = makeCommandContext([
      makeElement({ id: "visible", opacity: 40 }),
      makeElement({
        id: "hidden",
        opacity: 0,
      }),
    ])

    const plan = planToggleVisibility(context, { elementIds: ["visible", "hidden"] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) {
      return
    }

    expect(plan.value.elementPatches).toEqual([
      {
        id: "hidden",
        set: {
          opacity: 100,
          customData: {},
        },
      },
    ])
  })

  it("clamps originalOpacity of 0 to safe fallback (100) on restore", () => {
    const context = makeCommandContext([
      makeElement({
        id: "a",
        opacity: 0,
        customData: { originalOpacity: 0 },
      }),
    ])

    const plan = planToggleVisibility(context, { elementIds: ["a"] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    expect(plan.value.elementPatches[0]?.set.opacity).toBe(100)
    expect(plan.value.elementPatches[0]?.set.customData).toEqual({})
  })

  it("cleans up originalOpacity after restore so next hide records fresh value", () => {
    const context = makeCommandContext([
      makeElement({
        id: "a",
        opacity: 0,
        customData: { originalOpacity: 80 },
      }),
    ])

    const plan = planToggleVisibility(context, { elementIds: ["a"] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    const patch = plan.value.elementPatches[0]
    expect(patch?.set.opacity).toBe(80)
    expect(patch?.set.customData).toEqual({})
    expect("originalOpacity" in (patch?.set.customData ?? {})).toBe(false)
  })

  it("preserves other customData keys when cleaning up originalOpacity", () => {
    const context = makeCommandContext([
      makeElement({
        id: "a",
        opacity: 0,
        customData: { originalOpacity: 42, lmx: { label: "my layer" }, otherPlugin: true },
      }),
    ])

    const plan = planToggleVisibility(context, { elementIds: ["a"] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    const patch = plan.value.elementPatches[0]
    expect(patch?.set.opacity).toBe(42)
    expect(patch?.set.customData).toEqual({
      lmx: { label: "my layer" },
      otherPlugin: true,
    })
  })

  it("clamps negative originalOpacity to 100 on restore", () => {
    const context = makeCommandContext([
      makeElement({
        id: "a",
        opacity: 0,
        customData: { originalOpacity: -5 },
      }),
    ])

    const plan = planToggleVisibility(context, { elementIds: ["a"] })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    expect(plan.value.elementPatches[0]?.set.opacity).toBe(100)
    expect(plan.value.elementPatches[0]?.set.customData).toEqual({})
  })
})
