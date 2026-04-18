import {
  type KeyboardEventTraceRecord,
  createGlobalKeyboardEventFlightRecorder,
} from "obsidian-plugin-kit/debug/keyboard-event-flight-recorder"

/** LayerManager-specific adapter around the shared plugin-kit keyboard trace utility. */
export const KEY_EVENT_DEBUG_FLAG = "LMX_DEBUG_KEY_CAPTURE"

const recorder = createGlobalKeyboardEventFlightRecorder({
  stateKey: "__LMX_KEY_EVENT_FLIGHT_RECORDER__",
  debugFlagKey: KEY_EVENT_DEBUG_FLAG,
  globalReadKey: "LMX_KEY_TRACE_READ",
  globalClearKey: "LMX_KEY_TRACE_CLEAR",
  globalDumpKey: "LMX_KEY_TRACE_DUMP",
  consolePrefix: "[LMX:key]",
  dumpTitle: "# LMX Key Event Trace",
  shouldTrace: (event) => event.code === "Space" || event.altKey || event.ctrlKey || event.metaKey,
})

export type { KeyboardEventTraceRecord }

export const traceKeyboardEventIfRelevant = recorder.traceKeyboardEventIfRelevant
export const clearKeyEventTrace = recorder.clearKeyEventTrace
export const installKeyEventFlightRecorderGlobals = recorder.installKeyEventFlightRecorderGlobals
