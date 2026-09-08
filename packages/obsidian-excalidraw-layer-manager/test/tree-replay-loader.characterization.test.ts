import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { loadReplayTracesFromEnv } from "./fixtures/treeReplayTraceLoader.js"
import { makeElement } from "./testFixtures.js"

const minimalTrace = { snapshots: [{ elements: [{ id: "shape" }] }] }

// Exercise the actual file/environment entrypoint, not private parser internals.
describe("replay trace loader characterization", () => {
  let directory: string
  let file: string

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "lmx-replay-characterization-"))
    file = join(directory, "capture.json")
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", "")
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_DIR", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(directory, { recursive: true, force: true })
  })

  const writeJson = (path: string, value: unknown): void => {
    writeFileSync(path, JSON.stringify(value))
  }

  it("returns the supplied builtin traces unchanged when no external source is configured", () => {
    const builtin = [{ name: "builtin", snapshots: [] }]
    expect(loadReplayTracesFromEnv(builtin)).toEqual({
      traces: builtin,
      source: "builtin",
      resolvedPaths: [],
    })
    expect(loadReplayTracesFromEnv(builtin).traces).toBe(builtin)
  })

  it("rejects simultaneous file and directory settings before inspecting paths", () => {
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", "missing-file")
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_DIR", "missing-dir")
    expect(() => loadReplayTracesFromEnv([])).toThrow(
      "Set only one of LMX_TREE_REPLAY_TRACE_FILE or LMX_TREE_REPLAY_TRACE_DIR, not both.",
    )
  })

  it.each([
    ["LMX_TREE_REPLAY_TRACE_FILE", "file"],
    ["LMX_TREE_REPLAY_TRACE_DIR", "directory"],
  ])("rejects a missing path in %s", (variable, kind) => {
    const missing = join(directory, "missing")
    vi.stubEnv(variable, missing)
    expect(() => loadReplayTracesFromEnv([])).toThrow(`Replay trace ${kind} not found: ${missing}`)
  })

  it("rejects a directory configured as a file", () => {
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", directory)
    expect(() => loadReplayTracesFromEnv([])).toThrow(
      `Replay trace path is not a file: ${directory}`,
    )
  })

  it("rejects a file configured as a directory", () => {
    writeJson(file, minimalTrace)
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_DIR", file)
    expect(() => loadReplayTracesFromEnv([])).toThrow(
      `Replay trace path is not a directory: ${file}`,
    )
  })

  it("requires JSON files in a replay directory", () => {
    writeFileSync(join(directory, "notes.txt"), "not a trace")
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_DIR", directory)
    expect(() => loadReplayTracesFromEnv([])).toThrow(
      `Replay trace directory contains no .json files: ${directory}`,
    )
  })

  it.each([
    ["single trace", minimalTrace],
    ["trace array", [minimalTrace]],
    ["trace envelope", { traces: [minimalTrace] }],
  ])("loads %s with filename, snapshot, and element defaults", (_format, payload) => {
    writeJson(file, payload)
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", relative(process.cwd(), file))
    expect(loadReplayTracesFromEnv([])).toEqual({
      source: "file",
      resolvedPaths: [file],
      traces: [
        {
          name: "capture-1",
          snapshots: [
            {
              name: "capture-1-snapshot-1",
              elements: [
                {
                  id: "shape",
                  type: "rectangle",
                  zIndex: 0,
                  groupIds: [],
                  frameId: null,
                  containerId: null,
                  opacity: 100,
                  locked: false,
                  isDeleted: false,
                  customData: {},
                },
              ],
              expandedNodeIds: [],
              groupFreedraw: true,
            },
          ],
        },
      ],
    })
  })

  it("loads JSON extensions case-insensitively in filename order, ignoring other files", () => {
    const a = join(directory, "a.JSON")
    const b = join(directory, "b.json")
    writeJson(b, {
      traces: [
        { name: "second", ...minimalTrace },
        { name: "third", ...minimalTrace },
      ],
    })
    writeJson(a, [{ name: "first", ...minimalTrace }])
    writeFileSync(join(directory, "ignored.txt"), "not JSON")
    mkdirSync(join(directory, "ignored-directory"))
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_DIR", directory)
    const result = loadReplayTracesFromEnv([])
    expect(result.source).toBe("directory")
    expect(result.resolvedPaths).toEqual([a, b])
    expect(result.traces.map((trace) => trace.name)).toEqual(["first", "second", "third"])
  })

  it("preserves supported explicit element and snapshot fields", () => {
    const element = {
      id: "label",
      type: "text" as const,
      zIndex: 9,
      groupIds: ["g"],
      frameId: "f",
      containerId: "container",
      opacity: 0,
      locked: true,
      isDeleted: true,
      customData: { nested: { label: "saved" } },
      name: "Name",
      text: "Text",
    }
    writeJson(file, {
      name: "named",
      snapshots: [
        {
          name: "step",
          elements: [element, { id: "other", frameId: null, containerId: null }],
          expandedNodeIds: ["g"],
          groupFreedraw: false,
        },
      ],
    })
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", file)
    expect(loadReplayTracesFromEnv([]).traces).toEqual([
      {
        name: "named",
        snapshots: [
          {
            name: "step",
            elements: [element, makeElement({ id: "other", zIndex: 1 })],
            expandedNodeIds: ["g"],
            groupFreedraw: false,
          },
        ],
      },
    ])
  })

  it("defaults malformed optional fields rather than rejecting the whole trace", () => {
    writeJson(file, {
      name: "",
      snapshots: [
        {
          name: "",
          elements: [
            {
              id: "shape",
              type: 42,
              zIndex: "9",
              groupIds: ["valid", 1],
              frameId: false,
              containerId: {},
              opacity: "50",
              locked: 1,
              isDeleted: "false",
              customData: [],
              name: null,
              text: 12,
            },
          ],
          expandedNodeIds: ["g", false],
          groupFreedraw: "false",
        },
      ],
    })
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", file)
    expect(loadReplayTracesFromEnv([]).traces).toEqual([
      {
        name: "capture-1",
        snapshots: [
          {
            name: "capture-1-snapshot-1",
            elements: [makeElement({ id: "shape" })],
            expandedNodeIds: [],
            groupFreedraw: true,
          },
        ],
      },
    ])
  })

  it("defaults non-finite numeric values parsed from JSON exponent overflow", () => {
    writeFileSync(
      file,
      '{"snapshots":[{"elements":[{"id":"shape","zIndex":1e400,"opacity":-1e400}]}]}',
    )
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", file)
    expect(loadReplayTracesFromEnv([]).traces[0]?.snapshots[0]?.elements).toEqual([
      makeElement({ id: "shape" }),
    ])
  })

  it.each([
    ["null document", null, "must be an object or array"],
    ["primitive document", 3, "must be an object or array"],
    ["empty document array", [], "contains an empty array"],
    ["empty envelope", { traces: [] }, "has empty 'traces' array"],
    ["unknown envelope", { traces: "wrong" }, "must contain either a trace object"],
    ["null trace", [null], "trace[0] must be an object"],
    ["array trace", [[]], "trace[0] must be an object"],
    ["missing snapshots", [{}], "must contain a non-empty 'snapshots' array"],
    ["empty snapshots", { snapshots: [] }, "must contain a non-empty 'snapshots' array"],
    ["null snapshot", { snapshots: [null] }, "snapshot[0] must be an object"],
    ["missing elements", { snapshots: [{}] }, "must contain a non-empty 'elements' array"],
    [
      "empty elements",
      { snapshots: [{ elements: [] }] },
      "must contain a non-empty 'elements' array",
    ],
  ])("rejects %s with a contextual diagnostic", (_case, payload, diagnostic) => {
    writeJson(file, payload)
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", file)
    expect(() => loadReplayTracesFromEnv([])).toThrow(diagnostic)
  })

  it.each([
    ["nonobject element", null, "must be an object"],
    ["missing ID", {}, "is missing a non-empty string 'id'"],
    ["empty ID", { id: "" }, "is missing a non-empty string 'id'"],
    ["numeric ID", { id: 5 }, "is missing a non-empty string 'id'"],
    ["unsupported type", { id: "shape", type: "polygon" }, "has unsupported type 'polygon'"],
  ])("rejects %s identifying its trace, snapshot, and index", (_case, element, diagnostic) => {
    writeJson(file, { name: "named", snapshots: [{ name: "step", elements: [element] }] })
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", file)
    expect(() => loadReplayTracesFromEnv([])).toThrow(
      `trace 'named' snapshot 'step' element[0] ${diagnostic}`,
    )
  })

  it("wraps JSON syntax errors with the source filename", () => {
    writeFileSync(file, "{broken")
    vi.stubEnv("LMX_TREE_REPLAY_TRACE_FILE", file)
    expect(() => loadReplayTracesFromEnv([])).toThrow(
      `Failed to parse JSON replay trace file '${file}':`,
    )
  })
})
