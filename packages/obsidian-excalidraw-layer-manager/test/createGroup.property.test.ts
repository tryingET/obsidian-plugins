import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { planCreateGroup } from "../src/commands/createGroup.js"
import { makeCommandContext, makeElement } from "./testFixtures.js"

describe("planCreateGroup (property)", () => {
  it("always appends one shared group id to all selected targets", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.array(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 0, maxLength: 3 }),
        (count, existingGroups) => {
          const elements = Array.from({ length: count }, (_, index) =>
            makeElement({
              id: `el-${index}`,
              groupIds: existingGroups,
            }),
          )

          const context = makeCommandContext(elements)
          const plan = planCreateGroup(context, {
            elementIds: elements.map((element) => element.id),
            nameSeed: "Group",
          })

          expect(plan.ok).toBe(true)
          if (!plan.ok) {
            return
          }

          const newGroupId = plan.value.groupId
          expect(newGroupId.length).toBeGreaterThan(0)

          for (const patch of plan.value.patch.elementPatches) {
            expect(patch.set.groupIds).toBeDefined()
            const groupIds = patch.set.groupIds ?? []
            expect(groupIds.includes(newGroupId)).toBe(true)
          }
        },
      ),
    )
  })
})
