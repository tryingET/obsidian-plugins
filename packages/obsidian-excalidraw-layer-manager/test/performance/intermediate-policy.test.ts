import { describe, expect, it } from "vitest"
import {
  admitIntermediate,
  assertResources,
} from "../../scripts/performance/intermediate-policy.js"

const lock = "a".repeat(64)
const pair = () =>
  ["giant", "skewed"].map((shape) => ({
    purpose: "ak5583-intermediate-v1",
    size: 2000,
    shape,
    status: "passed",
    lockHash: lock,
    samples: 90,
    cleanup: { status: "stopped" },
    failure: null,
    peakRssMiB: 2000,
    maxOperationMs: 500,
  }))
describe("Given exploratory 2k sizing is separate from the frozen baseline", () => {
  it("When starting Then admit only the two declared shapes at2k", () => {
    for (const shape of ["giant", "skewed"])
      expect(() => admitIntermediate(2000, shape)).not.toThrow()
    for (const size of [1000, 10000, NaN]) expect(() => admitIntermediate(size, "giant")).toThrow()
    expect(() => admitIntermediate(2000, "pairs")).toThrow()
  })
  it("When2k passes with headroom Then5k adds a bounded bracket below the known10k failure", () => {
    expect(() => admitIntermediate(5000, "giant", pair(), lock)).not.toThrow()
  })
  it.each(["missing", "failed", "partial", "wrong-lock", "cleanup", "rss", "latency", "nan"])(
    "When2k evidence has%s Then no5k launch is justified",
    (mode) => {
      const rows = pair()
      const first = rows[0]!
      if (mode === "missing") rows.pop()
      if (mode === "failed") first.status = "failed"
      if (mode === "partial") first.samples = 89
      if (mode === "wrong-lock") first.lockHash = "b".repeat(64)
      if (mode === "cleanup") first.cleanup.status = "indeterminate"
      if (mode === "rss") first.peakRssMiB = 4097
      if (mode === "latency") first.maxOperationMs = 15001
      if (mode === "nan") first.peakRssMiB = NaN
      expect(() => admitIntermediate(5000, "giant", rows, lock)).toThrow()
    },
  )
  it("When resource readings are invalid or over the original caps Then fail closed", () => {
    expect(() => assertResources({ rssMiB: 1000, availableMiB: 8192 })).not.toThrow()
    for (const rssMiB of [-1, NaN, Infinity, 8192])
      expect(() => assertResources({ rssMiB, availableMiB: 8192 })).toThrow()
    expect(() => assertResources({ rssMiB: 1000, availableMiB: 4095 })).toThrow()
  })
})
