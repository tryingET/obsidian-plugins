export const KEY_EVENT_DEBUG_FLAG = "LMX_DEBUG_KEY_CAPTURE"
const KEY_EVENT_TRACE_MAX_EVENTS = 160

export interface KeyEventTraceRecord {
  readonly sequence: number
  readonly atMs: number
  readonly atIso: string
  readonly source: string
  readonly payload: Record<string, unknown>
}

interface KeyEventFlightRecorderState {
  nextSequence: number
  events: KeyEventTraceRecord[]
}

interface KeyEventFlightRecorderRuntime extends Record<string, unknown> {
  __LMX_KEY_EVENT_FLIGHT_RECORDER__?: KeyEventFlightRecorderState
  LMX_KEY_TRACE_READ?: () => readonly KeyEventTraceRecord[]
  LMX_KEY_TRACE_CLEAR?: () => void
  LMX_KEY_TRACE_DUMP?: () => string
}

const getRuntime = (): KeyEventFlightRecorderRuntime => {
  return globalThis as KeyEventFlightRecorderRuntime
}

const getRecorderState = (): KeyEventFlightRecorderState => {
  const runtime = getRuntime()

  if (!runtime.__LMX_KEY_EVENT_FLIGHT_RECORDER__) {
    runtime.__LMX_KEY_EVENT_FLIGHT_RECORDER__ = {
      nextSequence: 1,
      events: [],
    }
  }

  return runtime.__LMX_KEY_EVENT_FLIGHT_RECORDER__
}

const normalizeKeyboardKey = (key: string): string => {
  return key.length === 1 ? key.toLowerCase() : key
}

const resolveTargetTagName = (target: EventTarget | null): string | null => {
  if (!target || typeof target !== "object" || !("tagName" in target)) {
    return null
  }

  const tagName = (target as { readonly tagName?: unknown }).tagName
  return typeof tagName === "string" && tagName.length > 0 ? tagName : null
}

const clonePayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(Object.entries(payload))
}

const stringifyPayload = (payload: Record<string, unknown>): string => {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return JSON.stringify({ error: "payload-unserializable" }, null, 2)
  }
}

export const shouldTraceKeyboardEvent = (event: KeyboardEvent): boolean => {
  return (
    event.code === "KeyT" ||
    normalizeKeyboardKey(event.key) === "t" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
}

export const describeKeyboardEventForTrace = (
  event: KeyboardEvent,
  payload?: Record<string, unknown>,
): Record<string, unknown> => {
  return {
    type: event.type,
    key: event.key,
    code: event.code ?? "",
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    defaultPrevented: event.defaultPrevented,
    targetTagName: resolveTargetTagName(event.target),
    ...(payload ?? {}),
  }
}

export const isKeyEventDebugEnabled = (): boolean => {
  return getRuntime()[KEY_EVENT_DEBUG_FLAG] === true
}

export const recordKeyEventTrace = (
  source: string,
  payload: Record<string, unknown>,
): KeyEventTraceRecord => {
  const state = getRecorderState()
  const event: KeyEventTraceRecord = {
    sequence: state.nextSequence,
    atMs: Date.now(),
    atIso: new Date().toISOString(),
    source,
    payload: clonePayload(payload),
  }

  state.nextSequence += 1
  state.events.push(event)

  if (state.events.length > KEY_EVENT_TRACE_MAX_EVENTS) {
    state.events.splice(0, state.events.length - KEY_EVENT_TRACE_MAX_EVENTS)
  }

  if (isKeyEventDebugEnabled()) {
    console.log(`[LMX:key] ${source}`, event.payload)
  }

  return event
}

export const traceKeyboardEventIfRelevant = (
  source: string,
  event: KeyboardEvent,
  payload?: Record<string, unknown>,
): void => {
  if (!shouldTraceKeyboardEvent(event)) {
    return
  }

  recordKeyEventTrace(source, describeKeyboardEventForTrace(event, payload))
}

export const readKeyEventTrace = (): readonly KeyEventTraceRecord[] => {
  return getRecorderState().events.map((event) => ({
    ...event,
    payload: clonePayload(event.payload),
  }))
}

export const clearKeyEventTrace = (): void => {
  const state = getRecorderState()
  state.events.splice(0, state.events.length)
  state.nextSequence = 1
}

export const formatKeyEventTraceDump = (): string => {
  const events = readKeyEventTrace()
  const lines = ["# LMX Key Event Trace", `events=${events.length}`, ""]

  for (const event of events) {
    lines.push(`[${`${event.sequence}`.padStart(3, "0")}] ${event.atIso} source=${event.source}`)
    lines.push(stringifyPayload(event.payload))
    lines.push("")
  }

  return lines.join("\n")
}

export const installKeyEventFlightRecorderGlobals = (): void => {
  const runtime = getRuntime()
  runtime.LMX_KEY_TRACE_READ = () => readKeyEventTrace()
  runtime.LMX_KEY_TRACE_CLEAR = () => {
    clearKeyEventTrace()
  }
  runtime.LMX_KEY_TRACE_DUMP = () => {
    const dump = formatKeyEventTraceDump()
    console.log(dump)
    return dump
  }
}
