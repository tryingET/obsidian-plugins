import { describe, expect, it } from "vitest"
import { settleUntilStable } from "../../scripts/performance/native-settlement.js"

describe("Given a dispatched native action that must not be replayed", () => {
  it("When its revision changes during the first render opportunity Then wait for a fresh stable pair", async () => {
    let time = 0,
      revision = 1
    const result = await settleUntilStable(
      {
        ready: () => true,
        identity: () => revision,
        now: () => time,
        frame: async () => {
          time += 16
          if (time === 16) revision = 2
        },
      },
      200,
    )
    expect(result.identity).toBe(2)
    expect(result.opportunities).toHaveLength(2)
    expect(result.attempts).toBeGreaterThan(1)
    expect(result.opportunities[0]).toBeGreaterThan(result.settlement)
  })
  it("When semantic readiness never arrives Then fail at the bounded synchronization gate", async () => {
    let time = 0
    await expect(
      settleUntilStable(
        {
          ready: () => false,
          identity: () => 1,
          now: () => time,
          frame: async () => {
            time += 16
          },
        },
        100,
      ),
    ).rejects.toThrow("settlement timeout")
  })
  it("When semantics become stale between frames Then reject false settlement", async () => {
    let time = 0
    await expect(
      settleUntilStable(
        {
          ready: () => time === 0,
          identity: () => 1,
          now: () => time,
          frame: async () => {
            time += 16
          },
        },
        100,
      ),
    ).rejects.toThrow("settlement timeout")
  })
})
