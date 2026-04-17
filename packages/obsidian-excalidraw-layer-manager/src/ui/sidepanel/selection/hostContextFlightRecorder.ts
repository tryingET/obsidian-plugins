import type { ObsidianLike } from "../../../adapter/excalidraw-types.js"

export const SIDEPANEL_LIFECYCLE_DEBUG_FLAG = "LMX_DEBUG_SIDEPANEL_LIFECYCLE"
export const HOST_CONTEXT_FLIGHT_RECORDER_MAX_EVENTS = 240

export interface HostContextFlightRecorderEvent {
  readonly sequence: number
  readonly atMs: number
  readonly atIso: string
  readonly category: string
  readonly message: string
  readonly payload: Record<string, unknown> | null
}

interface HostContextFlightRecorderState {
  nextSequence: number
  events: HostContextFlightRecorderEvent[]
}

interface HostContextFlightRecorderRuntime extends Record<string, unknown> {
  __LMX_HOST_CONTEXT_FLIGHT_RECORDER__?: HostContextFlightRecorderState
  LMX_HOST_CONTEXT_TRACE_READ?: () => readonly HostContextFlightRecorderEvent[]
  LMX_HOST_CONTEXT_TRACE_CLEAR?: () => void
  LMX_HOST_CONTEXT_TRACE_DUMP?: () => string
  LMX_HOST_CONTEXT_TRACE_COPY?: () => Promise<string>
}

const getRuntime = (): HostContextFlightRecorderRuntime => {
  return globalThis as HostContextFlightRecorderRuntime
}

const getRecorderState = (): HostContextFlightRecorderState => {
  const runtime = getRuntime()

  if (!runtime.__LMX_HOST_CONTEXT_FLIGHT_RECORDER__) {
    runtime.__LMX_HOST_CONTEXT_FLIGHT_RECORDER__ = {
      nextSequence: 1,
      events: [],
    }
  }

  return runtime.__LMX_HOST_CONTEXT_FLIGHT_RECORDER__
}

const sanitizeForRecorder = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null
  }

  if (typeof value === "bigint") {
    return `${value}n`
  }

  if (typeof value === "symbol") {
    return String(value)
  }

  if (typeof value === "function") {
    return "[function]"
  }

  if (depth >= 5) {
    return "[depth-limit]"
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForRecorder(entry, depth + 1, seen))
  }

  if (value instanceof Set) {
    return [...value].map((entry) => sanitizeForRecorder(entry, depth + 1, seen))
  }

  if (value instanceof Map) {
    return [...value.entries()].map(([key, entry]) => [
      sanitizeForRecorder(key, depth + 1, seen),
      sanitizeForRecorder(entry, depth + 1, seen),
    ])
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    }
  }

  if (typeof value !== "object") {
    return `${value}`
  }

  if (seen.has(value)) {
    return "[circular]"
  }

  seen.add(value)

  const record = value as Record<string, unknown>
  const output: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(record)) {
    output[key] = sanitizeForRecorder(entry, depth + 1, seen)
  }

  seen.delete(value)
  return output
}

const sanitizePayload = (payload?: Record<string, unknown>): Record<string, unknown> | null => {
  if (!payload) {
    return null
  }

  return sanitizeForRecorder(payload) as Record<string, unknown>
}

const stringifyEventPayload = (payload: Record<string, unknown> | null): string => {
  if (!payload) {
    return "{}"
  }

  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return JSON.stringify({ error: "payload-unserializable" }, null, 2)
  }
}

export const isLifecycleDebugEnabled = (): boolean => {
  return getRuntime()[SIDEPANEL_LIFECYCLE_DEBUG_FLAG] === true
}

export const logLifecycleDebug = (message: string, payload?: Record<string, unknown>): void => {
  if (!isLifecycleDebugEnabled()) {
    return
  }

  if (payload) {
    console.log(`[LMX:lifecycle] ${message}`, payload)
    return
  }

  console.log(`[LMX:lifecycle] ${message}`)
}

export const recordHostContextFlightRecorderEvent = (
  category: string,
  message: string,
  payload?: Record<string, unknown>,
): HostContextFlightRecorderEvent => {
  const state = getRecorderState()
  const event: HostContextFlightRecorderEvent = {
    sequence: state.nextSequence,
    atMs: Date.now(),
    atIso: new Date().toISOString(),
    category,
    message,
    payload: sanitizePayload(payload),
  }

  state.nextSequence += 1
  state.events.push(event)

  if (state.events.length > HOST_CONTEXT_FLIGHT_RECORDER_MAX_EVENTS) {
    state.events.splice(0, state.events.length - HOST_CONTEXT_FLIGHT_RECORDER_MAX_EVENTS)
  }

  return event
}

export const traceHostContextLifecycleEvent = (
  category: string,
  message: string,
  payload?: Record<string, unknown>,
): HostContextFlightRecorderEvent => {
  const event = recordHostContextFlightRecorderEvent(category, message, payload)
  logLifecycleDebug(message, payload)
  return event
}

export const readHostContextFlightRecorderEvents =
  (): readonly HostContextFlightRecorderEvent[] => {
    const state = getRecorderState()
    return state.events.map((event) => ({
      ...event,
      payload: event.payload ? ({ ...event.payload } as Record<string, unknown>) : null,
    }))
  }

export const clearHostContextFlightRecorder = (): void => {
  const state = getRecorderState()
  state.events.splice(0, state.events.length)
  state.nextSequence = 1
}

export const formatHostContextFlightRecorderDump = (): string => {
  const events = readHostContextFlightRecorderEvents()
  const lines = ["# LMX Host Context Flight Recorder", `events=${events.length}`, ""]

  for (const event of events) {
    lines.push(
      `[${`${event.sequence}`.padStart(3, "0")}] ${event.atIso} category=${event.category} message=${event.message}`,
    )
    lines.push(stringifyEventPayload(event.payload))
    lines.push("")
  }

  return lines.join("\n")
}

const resolveClipboard = (): { writeText?: (text: string) => Promise<void> } | null => {
  const navigatorCandidate = (globalThis as { navigator?: { clipboard?: unknown } }).navigator
  const clipboardCandidate = navigatorCandidate?.clipboard

  return clipboardCandidate && typeof clipboardCandidate === "object"
    ? (clipboardCandidate as { writeText?: (text: string) => Promise<void> })
    : null
}

export const copyHostContextFlightRecorderDump = async (options?: {
  Notice?: ObsidianLike["Notice"]
}): Promise<string> => {
  const dump = formatHostContextFlightRecorderDump()
  const clipboard = resolveClipboard()

  if (typeof clipboard?.writeText === "function") {
    await clipboard.writeText(dump)
    options?.Notice && new options.Notice("[LMX] Host-context trace copied.", 2200)
    return dump
  }

  options?.Notice &&
    new options.Notice("[LMX] Clipboard unavailable; trace returned in console result.", 2600)
  return dump
}

export const installHostContextFlightRecorderGlobals = (options?: {
  Notice?: ObsidianLike["Notice"]
}): void => {
  const runtime = getRuntime()

  runtime.LMX_HOST_CONTEXT_TRACE_READ = () => readHostContextFlightRecorderEvents()
  runtime.LMX_HOST_CONTEXT_TRACE_CLEAR = () => {
    clearHostContextFlightRecorder()
  }
  runtime.LMX_HOST_CONTEXT_TRACE_DUMP = () => {
    const dump = formatHostContextFlightRecorderDump()
    console.log(dump)
    return dump
  }
  runtime.LMX_HOST_CONTEXT_TRACE_COPY = async () => {
    return copyHostContextFlightRecorderDump(options)
  }
}
