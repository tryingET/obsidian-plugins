import { afterEach, describe, expect, it, vi } from "vitest"

import {
  HOST_CONTEXT_FLIGHT_RECORDER_MAX_EVENTS,
  SIDEPANEL_LIFECYCLE_DEBUG_FLAG,
  clearHostContextFlightRecorder,
  formatHostContextFlightRecorderDump,
  installHostContextFlightRecorderGlobals,
  readHostContextFlightRecorderEvents,
  recordHostContextFlightRecorderEvent,
  traceHostContextLifecycleEvent,
} from "../src/ui/sidepanel/selection/hostContextFlightRecorder.js"

describe("sidepanel host-context flight recorder", () => {
  const globalRecord = globalThis as Record<string, unknown>
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  const hadLifecycleDebugFlag = Object.prototype.hasOwnProperty.call(
    globalRecord,
    SIDEPANEL_LIFECYCLE_DEBUG_FLAG,
  )
  const previousLifecycleDebugFlag = globalRecord[SIDEPANEL_LIFECYCLE_DEBUG_FLAG]

  afterEach(() => {
    if (hadLifecycleDebugFlag) {
      globalRecord[SIDEPANEL_LIFECYCLE_DEBUG_FLAG] = previousLifecycleDebugFlag
    } else {
      Reflect.deleteProperty(globalRecord, SIDEPANEL_LIFECYCLE_DEBUG_FLAG)
    }

    clearHostContextFlightRecorder()
    Reflect.deleteProperty(globalRecord, "LMX_HOST_CONTEXT_TRACE_READ")
    Reflect.deleteProperty(globalRecord, "LMX_HOST_CONTEXT_TRACE_CLEAR")
    Reflect.deleteProperty(globalRecord, "LMX_HOST_CONTEXT_TRACE_DUMP")
    Reflect.deleteProperty(globalRecord, "LMX_HOST_CONTEXT_TRACE_COPY")

    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor)
    } else {
      Reflect.deleteProperty(globalThis, "navigator")
    }
  })

  it("keeps a bounded tail of host-context events", () => {
    for (let index = 0; index < HOST_CONTEXT_FLIGHT_RECORDER_MAX_EVENTS + 5; index += 1) {
      recordHostContextFlightRecorderEvent("signal", `event-${index + 1}`)
    }

    const events = readHostContextFlightRecorderEvents()

    expect(events).toHaveLength(HOST_CONTEXT_FLIGHT_RECORDER_MAX_EVENTS)
    expect(events[0]?.message).toBe("event-6")
    expect(events.at(-1)?.message).toBe(`event-${HOST_CONTEXT_FLIGHT_RECORDER_MAX_EVENTS + 5}`)
  })

  it("sanitizes mirrored debug payloads and keeps reads isolated", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    globalRecord[SIDEPANEL_LIFECYCLE_DEBUG_FLAG] = true

    const circular = {
      nested: {
        count: 1,
      },
    } as Record<string, unknown>
    circular["self"] = circular

    traceHostContextLifecycleEvent("signal", "complex payload", {
      circular,
      failure: new Error("boom"),
      values: new Set(["alpha"]),
      mapping: new Map([["beta", { ok: true }]]),
      invoke: () => "ignored",
    })

    const firstRead = readHostContextFlightRecorderEvents()[0]
    expect(firstRead?.payload).toEqual(
      expect.objectContaining({
        circular: expect.objectContaining({
          nested: expect.objectContaining({
            count: 1,
          }),
          self: "[circular]",
        }),
        failure: expect.objectContaining({
          name: "Error",
          message: "boom",
        }),
        values: ["alpha"],
        mapping: [["beta", { ok: true }]],
        invoke: "[function]",
      }),
    )

    const firstCircular = firstRead?.payload?.["circular"] as
      | { nested?: { count?: number } }
      | undefined
    if (!firstCircular?.nested) {
      throw new Error("Expected sanitized circular payload to retain nested content.")
    }

    firstCircular.nested.count = 99

    const secondRead = readHostContextFlightRecorderEvents()[0]
    expect(
      (secondRead?.payload?.["circular"] as { nested?: { count?: number } } | undefined)?.nested
        ?.count ?? null,
    ).toBe(1)

    expect(logSpy).toHaveBeenCalledWith(
      "[LMX:lifecycle] complex payload",
      expect.objectContaining({
        invoke: "[function]",
      }),
    )

    logSpy.mockRestore()
  })

  it("installs global read, clear, dump, and copy helpers", async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: {
          writeText,
        },
      },
      configurable: true,
      writable: true,
    })

    recordHostContextFlightRecorderEvent("startup", "LayerManager script executed", {
      activeViewType: "excalidraw",
      targetViewIdentity: "view-1",
    })

    installHostContextFlightRecorderGlobals()

    const traceRead = globalRecord["LMX_HOST_CONTEXT_TRACE_READ"] as
      | (() => readonly { readonly message: string }[])
      | undefined
    const traceClear = globalRecord["LMX_HOST_CONTEXT_TRACE_CLEAR"] as (() => void) | undefined
    const dump = (globalRecord["LMX_HOST_CONTEXT_TRACE_DUMP"] as (() => string) | undefined)?.()

    expect(traceRead?.().map((event) => event.message)).toEqual(["LayerManager script executed"])
    expect(dump).toContain("# LMX Host Context Flight Recorder")
    expect(dump).toContain("LayerManager script executed")
    expect(formatHostContextFlightRecorderDump()).toContain('"activeViewType": "excalidraw"')

    traceClear?.()
    expect(traceRead?.()).toEqual([])

    recordHostContextFlightRecorderEvent("startup", "LayerManager reran", {
      activeViewType: "excalidraw",
    })

    const copiedDump = await (
      globalRecord["LMX_HOST_CONTEXT_TRACE_COPY"] as (() => Promise<string>) | undefined
    )?.()

    expect(copiedDump).toContain("LayerManager reran")
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("LayerManager reran"))
  })
})
