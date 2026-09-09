import { describe, expect, it } from "vitest"
import { selectOwnedWindow } from "../../scripts/performance/native-focus.js"

describe("Given native desktop focus must not target a personal Obsidian window", () => {
  it("When one fresh host has two windows Then bind exact PID AND the nonce title set through guarded CDP", () => {
    const windows = {
      "1": { id: 1, pid: 20, title: "AK5583 fresh" },
      "2": { id: 2, pid: 20, title: "vault" },
      "3": { id: 3, pid: 10, title: "AK5583 fresh" },
    }
    expect(selectOwnedWindow(windows, 20, "AK5583 fresh").id).toBe(1)
    expect(() => selectOwnedWindow(windows, 21, "AK5583 fresh")).toThrow()
    expect(() => selectOwnedWindow(windows, 20, "AK5583 stale")).toThrow()
  })
  it("When Niri provides window identities Then select only the unique exact fresh owned PID", () => {
    expect(selectOwnedWindow({ "1": { id: 1, pid: 10 }, "2": { id: 2, pid: 20 } }, 20)).toEqual({
      id: 2,
      pid: 20,
    })
  })
  it("When PID proof is absent, foreign or ambiguous Then never fall back to title/app-id", () => {
    expect(() => selectOwnedWindow({ "1": { id: 1, pid: 10 } }, 20)).toThrow()
    expect(() => selectOwnedWindow({ "1": { id: 1, pid: null } }, 20)).toThrow()
    expect(() =>
      selectOwnedWindow({ "1": { id: 1, pid: 20 }, "2": { id: 2, pid: 20 } }, 20),
    ).toThrow()
    expect(() => selectOwnedWindow({}, 20)).toThrow()
  })
  it("When a window id is malformed Then no desktop action is admissible", () => {
    expect(() => selectOwnedWindow({ "1": { id: NaN, pid: 20 } }, 20)).toThrow()
  })
})
