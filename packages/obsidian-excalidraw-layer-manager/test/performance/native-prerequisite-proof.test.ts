import { describe, expect, it } from "vitest"
import { assertNativePrerequisite } from "../../scripts/performance/native-prerequisite-proof.js"

describe("Given a semantic result can precede a later failed child closeout", () => {
  const expected = { kind: "sentinels", output: "/owned/sentinels" }
  const closeout = { failure: null, cleanup: { status: "stopped" } }
  const receipt = {
    schema: "ak5583-prerequisite-exit-v1",
    ...expected,
    pid: 123,
    code: 0,
    signal: null,
  }
  it("When the child really exits cleanly Then admission succeeds", () =>
    expect(() => assertNativePrerequisite(closeout, receipt, expected)).not.toThrow())
  it("When post-result integrity failed Then passed semantic content cannot qualify", () =>
    expect(() =>
      assertNativePrerequisite(
        { ...closeout, failure: "installed plugin drift" },
        receipt,
        expected,
      ),
    ).toThrow())
  it("When exit is missing, failed, signalled, foreign or cleanup incomplete Then reject", () => {
    for (const bad of [
      null,
      { ...receipt, code: 1 },
      { ...receipt, signal: "SIGTERM" },
      { ...receipt, output: "/foreign" },
      { ...receipt, kind: "pilot" },
      { ...receipt, pid: null },
    ])
      expect(() => assertNativePrerequisite(closeout, bad, expected)).toThrow()
    expect(() =>
      assertNativePrerequisite({ cleanup: { status: "stopped" } }, receipt, expected),
    ).toThrow()
    expect(() =>
      assertNativePrerequisite(
        { failure: null, cleanup: { status: "indeterminate" } },
        receipt,
        expected,
      ),
    ).toThrow()
  })
})
