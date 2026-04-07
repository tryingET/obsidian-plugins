import { performance } from "node:perf_hooks"

import { describe, expect, it } from "vitest"

import { buildLayerTree } from "../src/domain/treeBuilder.js"
import type { ElementDTO } from "../src/model/entities.js"
import { type SceneIndexes, buildSceneIndexes } from "../src/model/indexes.js"
import { loadReplayTracesFromEnv } from "./fixtures/treeReplayTraceLoader.js"
import { TREE_REPLAY_TRACES, type TreeReplayTrace } from "./fixtures/treeReplayTraces.js"
import { makeElement, makeSnapshot } from "./testFixtures.js"

const DEFAULT_ITERATIONS = 60
const DEFAULT_WARMUP = 8
const DEFAULT_REPLAY_ITERATIONS = 24
const DEFAULT_REPLAY_WARMUP = 4
const DEFAULT_TARGET_P95_MS = 16
const DEFAULT_HARD_CEILING_MS = 250

const toNumberEnv = (name: string, fallback: number): number => {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const rawIndex = Math.ceil(sorted.length * p) - 1
  const index = Math.min(sorted.length - 1, Math.max(0, rawIndex))
  return sorted[index] ?? 0
}

const makeSyntheticScene = (size: number): ElementDTO[] => {
  const elements: ElementDTO[] = []

  let activeFrameId: string | null = null
  let lastRectangleId: string | null = null

  for (let index = 0; index < size; index += 1) {
    if (index % 250 === 0) {
      activeFrameId = `frame-${index}`
      lastRectangleId = null
      elements.push(
        makeElement({
          id: activeFrameId,
          type: "frame",
          zIndex: index,
        }),
      )
      continue
    }

    if (index % 9 === 0 && lastRectangleId) {
      elements.push(
        makeElement({
          id: `text-${index}`,
          type: "text",
          zIndex: index,
          frameId: activeFrameId,
          containerId: lastRectangleId,
        }),
      )
      continue
    }

    const groupIds =
      index % 11 === 0
        ? [`inner-${Math.floor(index / 22)}`, `outer-${Math.floor(index / 110)}`]
        : index % 13 === 0
          ? [`outer-${Math.floor(index / 110)}`]
          : []

    const type = index % 7 === 0 ? "freedraw" : "rectangle"
    const id = type === "freedraw" ? `stroke-${index}` : `shape-${index}`

    elements.push(
      makeElement({
        id,
        type,
        zIndex: index,
        frameId: activeFrameId,
        groupIds,
      }),
    )

    if (type === "rectangle") {
      lastRectangleId = id
    }
  }

  return elements
}

const measureTreeBuildTimes = (
  elements: readonly ElementDTO[],
  iterations: number,
  warmup: number,
): number[] => {
  const snapshot = makeSnapshot(elements)
  const indexes = buildSceneIndexes(snapshot)
  const expandedNodeIds = new Set<string>()

  for (let index = 0; index < warmup; index += 1) {
    buildLayerTree(
      {
        elements,
        expandedNodeIds,
        groupFreedraw: true,
      },
      indexes,
    )
  }

  const timings: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now()
    const tree = buildLayerTree(
      {
        elements,
        expandedNodeIds,
        groupFreedraw: true,
      },
      indexes,
    )
    const duration = performance.now() - start

    if (tree.length === 0) {
      throw new Error("Unexpected empty tree in performance harness")
    }

    timings.push(duration)
  }

  return timings
}

interface PreparedReplaySnapshot {
  readonly name: string
  readonly elements: readonly ElementDTO[]
  readonly indexes: SceneIndexes
  readonly expandedNodeIds: ReadonlySet<string>
  readonly groupFreedraw: boolean
}

const prepareReplayTrace = (trace: TreeReplayTrace): readonly PreparedReplaySnapshot[] => {
  return trace.snapshots.map((snapshot) => {
    const sceneSnapshot = makeSnapshot(snapshot.elements)

    return {
      name: snapshot.name,
      elements: snapshot.elements,
      indexes: buildSceneIndexes(sceneSnapshot),
      expandedNodeIds: new Set(snapshot.expandedNodeIds),
      groupFreedraw: snapshot.groupFreedraw,
    }
  })
}

const measureReplayTraceBuildTimes = (
  trace: TreeReplayTrace,
  iterations: number,
  warmup: number,
): number[] => {
  const preparedSnapshots = prepareReplayTrace(trace)

  for (let warmupIndex = 0; warmupIndex < warmup; warmupIndex += 1) {
    for (const snapshot of preparedSnapshots) {
      buildLayerTree(
        {
          elements: snapshot.elements,
          expandedNodeIds: snapshot.expandedNodeIds,
          groupFreedraw: snapshot.groupFreedraw,
        },
        snapshot.indexes,
      )
    }
  }

  const timings: number[] = []

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const snapshot of preparedSnapshots) {
      const start = performance.now()
      const tree = buildLayerTree(
        {
          elements: snapshot.elements,
          expandedNodeIds: snapshot.expandedNodeIds,
          groupFreedraw: snapshot.groupFreedraw,
        },
        snapshot.indexes,
      )
      const duration = performance.now() - start

      if (tree.length === 0) {
        throw new Error(`Unexpected empty tree for replay snapshot: ${snapshot.name}`)
      }

      timings.push(duration)
    }
  }

  return timings
}

describe("buildLayerTree performance harness", () => {
  it("tracks p95 on a synthetic 2k mixed scene", () => {
    const iterations = toNumberEnv("LMX_TREE_BENCH_ITERATIONS", DEFAULT_ITERATIONS)
    const warmup = toNumberEnv("LMX_TREE_BENCH_WARMUP", DEFAULT_WARMUP)
    const targetP95 = toNumberEnv("LMX_TREE_TARGET_P95_MS", DEFAULT_TARGET_P95_MS)
    const hardCeilingP95 = toNumberEnv("LMX_TREE_HARD_CEILING_MS", DEFAULT_HARD_CEILING_MS)
    const enforceTarget = process.env["LMX_ENFORCE_TREE_P95_BUDGET"] === "true"

    const scene = makeSyntheticScene(2000)
    const timings = measureTreeBuildTimes(scene, iterations, warmup)

    const p50 = percentile(timings, 0.5)
    const p95 = percentile(timings, 0.95)
    const max = Math.max(...timings)

    console.info(
      `[tree-bench] size=2000 iterations=${iterations} warmup=${warmup} p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
    )

    expect(p95).toBeLessThanOrEqual(hardCeilingP95)

    if (enforceTarget) {
      expect(p95).toBeLessThanOrEqual(targetP95)
    }
  })

  it("tracks p95 on replay-trace sessions", () => {
    const iterations = toNumberEnv("LMX_TREE_REPLAY_BENCH_ITERATIONS", DEFAULT_REPLAY_ITERATIONS)
    const warmup = toNumberEnv("LMX_TREE_REPLAY_BENCH_WARMUP", DEFAULT_REPLAY_WARMUP)
    const targetP95 = toNumberEnv("LMX_TREE_TARGET_P95_MS", DEFAULT_TARGET_P95_MS)
    const hardCeilingP95 = toNumberEnv("LMX_TREE_HARD_CEILING_MS", DEFAULT_HARD_CEILING_MS)
    const enforceTarget = process.env["LMX_ENFORCE_TREE_P95_BUDGET"] === "true"

    const replaySource = loadReplayTracesFromEnv(TREE_REPLAY_TRACES)
    expect(replaySource.traces.length).toBeGreaterThan(0)

    if (replaySource.source !== "builtin") {
      console.info(
        `[tree-bench:replay] source=${replaySource.source} paths=${replaySource.resolvedPaths.join(";")}`,
      )
    }

    for (const trace of replaySource.traces) {
      const timings = measureReplayTraceBuildTimes(trace, iterations, warmup)

      const p50 = percentile(timings, 0.5)
      const p95 = percentile(timings, 0.95)
      const max = Math.max(...timings)

      console.info(
        `[tree-bench:replay] trace=${trace.name} snapshots=${trace.snapshots.length} iterations=${iterations} warmup=${warmup} p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
      )

      expect(p95).toBeLessThanOrEqual(hardCeilingP95)

      if (enforceTarget) {
        expect(p95).toBeLessThanOrEqual(targetP95)
      }
    }
  })
})
