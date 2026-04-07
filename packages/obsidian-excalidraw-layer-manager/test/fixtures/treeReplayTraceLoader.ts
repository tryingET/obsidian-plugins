import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, extname, join, resolve } from "node:path"

import type { ElementDTO, ElementType } from "../../src/model/entities.js"
import { makeElement } from "../testFixtures.js"
import type { TreeReplaySnapshot, TreeReplayTrace } from "./treeReplayTraces.js"

interface LoadedReplayTraces {
  readonly traces: readonly TreeReplayTrace[]
  readonly source: "builtin" | "file" | "directory"
  readonly resolvedPaths: readonly string[]
}

type JsonRecord = Record<string, unknown>

const ELEMENT_TYPES = new Set<ElementType>([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "freedraw",
  "text",
  "image",
  "frame",
  "group",
  "unknown",
])

const isElementType = (value: string): value is ElementType => {
  return ELEMENT_TYPES.has(value as ElementType)
}

const asRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as JsonRecord
}

const asStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) {
    return null
  }

  const strings: string[] = []
  for (const entry of value) {
    if (typeof entry !== "string") {
      return null
    }
    strings.push(entry)
  }

  return strings
}

const ensureRecord = (value: unknown, context: string): JsonRecord => {
  const record = asRecord(value)
  if (record) {
    return record
  }

  throw new Error(`${context} must be an object`)
}

const parseElement = (
  value: unknown,
  elementIndex: number,
  traceName: string,
  snapshotName: string,
): ElementDTO => {
  const context = `trace '${traceName}' snapshot '${snapshotName}' element[${elementIndex}]`
  const record = ensureRecord(value, context)

  const rawId = record["id"]
  if (typeof rawId !== "string" || rawId.length === 0) {
    throw new Error(`${context} is missing a non-empty string 'id'`)
  }

  const partial: Partial<ElementDTO> & { id: string } = {
    id: rawId,
    zIndex: elementIndex,
  }

  const rawType = record["type"]
  if (typeof rawType === "string") {
    if (!isElementType(rawType)) {
      throw new Error(`${context} has unsupported type '${rawType}'`)
    }
    partial.type = rawType
  }

  const rawZIndex = record["zIndex"]
  if (typeof rawZIndex === "number" && Number.isFinite(rawZIndex)) {
    partial.zIndex = rawZIndex
  }

  const rawGroupIds = asStringArray(record["groupIds"])
  if (rawGroupIds) {
    partial.groupIds = rawGroupIds
  }

  const rawFrameId = record["frameId"]
  if (typeof rawFrameId === "string" || rawFrameId === null) {
    partial.frameId = rawFrameId
  }

  const rawContainerId = record["containerId"]
  if (typeof rawContainerId === "string" || rawContainerId === null) {
    partial.containerId = rawContainerId
  }

  const rawOpacity = record["opacity"]
  if (typeof rawOpacity === "number" && Number.isFinite(rawOpacity)) {
    partial.opacity = rawOpacity
  }

  const rawLocked = record["locked"]
  if (typeof rawLocked === "boolean") {
    partial.locked = rawLocked
  }

  const rawDeleted = record["isDeleted"]
  if (typeof rawDeleted === "boolean") {
    partial.isDeleted = rawDeleted
  }

  const rawCustomData = asRecord(record["customData"])
  if (rawCustomData) {
    partial.customData = { ...rawCustomData }
  }

  const rawName = record["name"]
  if (typeof rawName === "string") {
    partial.name = rawName
  }

  const rawText = record["text"]
  if (typeof rawText === "string") {
    partial.text = rawText
  }

  return makeElement(partial)
}

const parseSnapshot = (
  value: unknown,
  snapshotIndex: number,
  traceName: string,
): TreeReplaySnapshot => {
  const context = `trace '${traceName}' snapshot[${snapshotIndex}]`
  const record = ensureRecord(value, context)

  const snapshotName =
    typeof record["name"] === "string" && record["name"].length > 0
      ? record["name"]
      : `${traceName}-snapshot-${snapshotIndex + 1}`

  const rawElements = record["elements"]
  if (!Array.isArray(rawElements) || rawElements.length === 0) {
    throw new Error(`${context} must contain a non-empty 'elements' array`)
  }

  const elements = rawElements.map((element, elementIndex) =>
    parseElement(element, elementIndex, traceName, snapshotName),
  )

  const expandedNodeIds = asStringArray(record["expandedNodeIds"]) ?? []
  const groupFreedraw =
    typeof record["groupFreedraw"] === "boolean" ? record["groupFreedraw"] : true

  return {
    name: snapshotName,
    elements,
    expandedNodeIds,
    groupFreedraw,
  }
}

const parseTrace = (value: unknown, fallbackName: string, traceIndex: number): TreeReplayTrace => {
  const context = `trace[${traceIndex}]`
  const record = ensureRecord(value, context)

  const traceName =
    typeof record["name"] === "string" && record["name"].length > 0
      ? record["name"]
      : `${fallbackName}-${traceIndex + 1}`

  const rawSnapshots = record["snapshots"]
  if (!Array.isArray(rawSnapshots) || rawSnapshots.length === 0) {
    throw new Error(`${context} ('${traceName}') must contain a non-empty 'snapshots' array`)
  }

  return {
    name: traceName,
    snapshots: rawSnapshots.map((snapshot, snapshotIndex) =>
      parseSnapshot(snapshot, snapshotIndex, traceName),
    ),
  }
}

const parseTraceFileContent = (value: unknown, sourcePath: string): readonly TreeReplayTrace[] => {
  const sourceBaseName = basename(sourcePath, extname(sourcePath))

  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error(`Replay trace file '${sourcePath}' contains an empty array`)
    }

    return value.map((trace, traceIndex) => parseTrace(trace, sourceBaseName, traceIndex))
  }

  const record = asRecord(value)
  if (!record) {
    throw new Error(`Replay trace file '${sourcePath}' must be an object or array`)
  }

  const tracesValue = record["traces"]
  if (Array.isArray(tracesValue)) {
    if (tracesValue.length === 0) {
      throw new Error(`Replay trace file '${sourcePath}' has empty 'traces' array`)
    }

    return tracesValue.map((trace, traceIndex) => parseTrace(trace, sourceBaseName, traceIndex))
  }

  if (Array.isArray(record["snapshots"])) {
    return [parseTrace(record, sourceBaseName, 0)]
  }

  throw new Error(
    `Replay trace file '${sourcePath}' must contain either a trace object, an array of traces, or { traces: [...] }`,
  )
}

const parseReplayTraceFile = (filePath: string): readonly TreeReplayTrace[] => {
  const raw = readFileSync(filePath, "utf8")

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse JSON replay trace file '${filePath}': ${message}`)
  }

  return parseTraceFileContent(parsed, filePath)
}

const resolvePathFromProjectRoot = (pathValue: string): string => {
  return resolve(process.cwd(), pathValue)
}

const ensureFilePath = (pathValue: string): string => {
  const resolved = resolvePathFromProjectRoot(pathValue)
  if (!existsSync(resolved)) {
    throw new Error(`Replay trace file not found: ${resolved}`)
  }

  if (!statSync(resolved).isFile()) {
    throw new Error(`Replay trace path is not a file: ${resolved}`)
  }

  return resolved
}

const ensureDirectoryPath = (pathValue: string): string => {
  const resolved = resolvePathFromProjectRoot(pathValue)
  if (!existsSync(resolved)) {
    throw new Error(`Replay trace directory not found: ${resolved}`)
  }

  if (!statSync(resolved).isDirectory()) {
    throw new Error(`Replay trace path is not a directory: ${resolved}`)
  }

  return resolved
}

export const loadReplayTracesFromEnv = (
  builtInTraces: readonly TreeReplayTrace[],
): LoadedReplayTraces => {
  const fileEnv = process.env["LMX_TREE_REPLAY_TRACE_FILE"]
  const dirEnv = process.env["LMX_TREE_REPLAY_TRACE_DIR"]

  if (fileEnv && dirEnv) {
    throw new Error(
      "Set only one of LMX_TREE_REPLAY_TRACE_FILE or LMX_TREE_REPLAY_TRACE_DIR, not both.",
    )
  }

  if (fileEnv) {
    const filePath = ensureFilePath(fileEnv)
    const traces = parseReplayTraceFile(filePath)

    return {
      traces,
      source: "file",
      resolvedPaths: [filePath],
    }
  }

  if (dirEnv) {
    const dirPath = ensureDirectoryPath(dirEnv)
    const jsonFiles = readdirSync(dirPath)
      .filter((entry) => entry.toLowerCase().endsWith(".json"))
      .sort((left, right) => left.localeCompare(right))

    if (jsonFiles.length === 0) {
      throw new Error(`Replay trace directory contains no .json files: ${dirPath}`)
    }

    const traces: TreeReplayTrace[] = []
    const resolvedPaths: string[] = []

    for (const fileName of jsonFiles) {
      const filePath = join(dirPath, fileName)
      resolvedPaths.push(filePath)
      traces.push(...parseReplayTraceFile(filePath))
    }

    return {
      traces,
      source: "directory",
      resolvedPaths,
    }
  }

  return {
    traces: builtInTraces,
    source: "builtin",
    resolvedPaths: [],
  }
}
