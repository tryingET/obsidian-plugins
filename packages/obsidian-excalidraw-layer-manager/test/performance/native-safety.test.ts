import { describe, expect, it } from "vitest"
import { admitSize, assertHostIdentity } from "../../scripts/performance/native-safety.js"

describe("Given a newly owned disposable Obsidian host", () => {
  const owned = {
    vault: "/owned/run/vault",
    profile: "/owned/run/profile",
    pid: 123,
    start: "99",
    targetId: "fresh",
    nonce: "unique",
    scriptHash: "a".repeat(64),
  }
  const observed = { ...owned, url: "app://obsidian.md/index.html", native: true }
  it("When all live identities agree Then admission succeeds", () => {
    expect(() => assertHostIdentity(owned, observed)).not.toThrow()
  })
  for (const key of [
    "vault",
    "profile",
    "pid",
    "start",
    "targetId",
    "nonce",
    "scriptHash",
    "url",
    "native",
  ]) {
    it(`When ${key} drifts Then the host is rejected before effects`, () => {
      expect(() => assertHostIdentity(owned, { ...observed, [key]: "stale" })).toThrow()
    })
  }
  it("When an old case timed out Then larger work cannot be admitted", () => {
    expect(() =>
      admitSize(10000, {
        completedSizes: [1000],
        pilotPassed: true,
        effect: "indeterminate",
        rssMiB: 500,
        availableMiB: 16000,
      }),
    ).toThrow()
  })
  it("When pilot or predecessor proof is missing Then larger work is rejected", () => {
    expect(() =>
      admitSize(10000, {
        completedSizes: [],
        pilotPassed: false,
        effect: "settled",
        rssMiB: 500,
        availableMiB: 16000,
      }),
    ).toThrow()
    expect(() =>
      admitSize(100000, {
        completedSizes: [1000],
        pilotPassed: true,
        effect: "settled",
        rssMiB: 500,
        availableMiB: 16000,
      }),
    ).toThrow()
  })
  it("When memory headroom is insufficient Then even the pilot is rejected", () => {
    expect(() =>
      admitSize(1000, {
        completedSizes: [],
        pilotPassed: false,
        effect: "settled",
        rssMiB: 7500,
        availableMiB: 500,
      }),
    ).toThrow()
  })
  it("When 1k semantics and resources pass Then 10k is admissible", () => {
    expect(() =>
      admitSize(10000, {
        completedSizes: [1000],
        pilotPassed: true,
        effect: "settled",
        rssMiB: 500,
        availableMiB: 16000,
      }),
    ).not.toThrow()
  })
})
