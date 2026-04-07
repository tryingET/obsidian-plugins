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
})
