export interface KeyboardEventTraceRecord {
  readonly sequence: number
  readonly atMs: number
  readonly atIso: string
  readonly source: string
  readonly payload: Record<string, unknown>
}

interface KeyboardEventFlightRecorderState {
  nextSequence: number
  events: KeyboardEventTraceRecord[]
}

interface KeyboardEventFlightRecorderRuntime extends Record<string, unknown> {}

export interface GlobalKeyboardEventFlightRecorderOptions {
  readonly stateKey: string
  readonly debugFlagKey: string
  readonly globalReadKey: string
  readonly globalClearKey: string
  readonly globalDumpKey: string
  readonly consolePrefix?: string
  readonly dumpTitle?: string
  readonly maxEvents?: number
  readonly shouldTrace?: (event: KeyboardEvent) => boolean
}

export interface GlobalKeyboardEventFlightRecorder {
  readonly debugFlagKey: string
  shouldTraceKeyboardEvent: (event: KeyboardEvent) => boolean
  describeKeyboardEventForTrace: (
    event: KeyboardEvent,
    payload?: Record<string, unknown>,
  ) => Record<string, unknown>
  isDebugEnabled: () => boolean
  recordKeyEventTrace: (source: string, payload: Record<string, unknown>) => KeyboardEventTraceRecord
  traceKeyboardEventIfRelevant: (
    source: string,
    event: KeyboardEvent,
    payload?: Record<string, unknown>,
  ) => void
  readKeyEventTrace: () => readonly KeyboardEventTraceRecord[]
  clearKeyEventTrace: () => void
  formatKeyEventTraceDump: () => string
  installKeyEventFlightRecorderGlobals: () => void
}

const DEFAULT_MAX_EVENTS = 160
const DEFAULT_CONSOLE_PREFIX = "[debug:key]"

const getRuntime = (): KeyboardEventFlightRecorderRuntime => {
  return globalThis as KeyboardEventFlightRecorderRuntime
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

const createDefaultShouldTrace = (event: KeyboardEvent): boolean => {
  return (
    event.code === "Space" ||
    normalizeKeyboardKey(event.key) === "t" ||
    event.code === "KeyT" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
}

export const createGlobalKeyboardEventFlightRecorder = (
  options: GlobalKeyboardEventFlightRecorderOptions,
): GlobalKeyboardEventFlightRecorder => {
  const consolePrefix = options.consolePrefix ?? DEFAULT_CONSOLE_PREFIX
  const dumpTitle = options.dumpTitle ?? "# Key Event Trace"
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS
  const shouldTrace = options.shouldTrace ?? createDefaultShouldTrace

  const getRecorderState = (): KeyboardEventFlightRecorderState => {
    const runtime = getRuntime()
    const existing = runtime[options.stateKey]

    if (
      existing &&
      typeof existing === "object" &&
      "nextSequence" in existing &&
      "events" in existing &&
      Array.isArray((existing as { readonly events?: unknown }).events)
    ) {
      return existing as KeyboardEventFlightRecorderState
    }

    const nextState: KeyboardEventFlightRecorderState = {
      nextSequence: 1,
      events: [],
    }
    runtime[options.stateKey] = nextState
    return nextState
  }

  const describeKeyboardEventForTrace = (
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

  const isDebugEnabled = (): boolean => {
    return getRuntime()[options.debugFlagKey] === true
  }

  const recordKeyEventTrace = (
    source: string,
    payload: Record<string, unknown>,
  ): KeyboardEventTraceRecord => {
    const state = getRecorderState()
    const event: KeyboardEventTraceRecord = {
      sequence: state.nextSequence,
      atMs: Date.now(),
      atIso: new Date().toISOString(),
      source,
      payload: clonePayload(payload),
    }

    state.nextSequence += 1
    state.events.push(event)

    if (state.events.length > maxEvents) {
      state.events.splice(0, state.events.length - maxEvents)
    }

    if (isDebugEnabled()) {
      console.log(`${consolePrefix} ${source}`, event.payload)
    }

    return event
  }

  const traceKeyboardEventIfRelevant = (
    source: string,
    event: KeyboardEvent,
    payload?: Record<string, unknown>,
  ): void => {
    if (!shouldTrace(event)) {
      return
    }

    recordKeyEventTrace(source, describeKeyboardEventForTrace(event, payload))
  }

  const readKeyEventTrace = (): readonly KeyboardEventTraceRecord[] => {
    return getRecorderState().events.map((event) => ({
      ...event,
      payload: clonePayload(event.payload),
    }))
  }

  const clearKeyEventTrace = (): void => {
    const state = getRecorderState()
    state.events.splice(0, state.events.length)
    state.nextSequence = 1
  }

  const formatKeyEventTraceDump = (): string => {
    const events = readKeyEventTrace()
    const lines = [dumpTitle, `events=${events.length}`, ""]

    for (const event of events) {
      lines.push(`[${`${event.sequence}`.padStart(3, "0")}] ${event.atIso} source=${event.source}`)
      lines.push(stringifyPayload(event.payload))
      lines.push("")
    }

    return lines.join("\n")
  }

  const installKeyEventFlightRecorderGlobals = (): void => {
    const runtime = getRuntime()
    runtime[options.globalReadKey] = () => readKeyEventTrace()
    runtime[options.globalClearKey] = () => {
      clearKeyEventTrace()
    }
    runtime[options.globalDumpKey] = () => {
      const dump = formatKeyEventTraceDump()
      console.log(dump)
      return dump
    }
  }

  return {
    debugFlagKey: options.debugFlagKey,
    shouldTraceKeyboardEvent: shouldTrace,
    describeKeyboardEventForTrace,
    isDebugEnabled,
    recordKeyEventTrace,
    traceKeyboardEventIfRelevant,
    readKeyEventTrace,
    clearKeyEventTrace,
    formatKeyEventTraceDump,
    installKeyEventFlightRecorderGlobals,
  }
}
