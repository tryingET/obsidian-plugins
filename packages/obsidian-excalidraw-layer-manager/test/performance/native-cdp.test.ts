import { afterEach, describe, expect, it, vi } from "vitest"
import { Cdp } from "../../scripts/performance/native-host.js"

class Socket extends EventTarget {
  static latest: Socket
  sent: unknown[] = []
  constructor(_url?: string) {
    super()
    Socket.latest = this
  }
  send(value: string) {
    this.sent.push(JSON.parse(value))
  }
  close() {
    this.dispatchEvent(new Event("close"))
  }
}
afterEach(() => vi.useRealTimers())
describe("Given a bounded native CDP connection", () => {
  it("When the handshake never opens Then startup fails rather than hanging", async () => {
    vi.useFakeTimers()
    const connecting = Cdp.connect("ws://127.0.0.1/fresh", 50, Socket)
    const assertion = expect(connecting).rejects.toThrow("handshake timeout")
    await vi.advanceTimersByTimeAsync(51)
    await assertion
  })
  it("When the socket closes before opening Then startup fails immediately", async () => {
    const connecting = Cdp.connect("ws://127.0.0.1/fresh", 50, Socket)
    const assertion = expect(connecting).rejects.toThrow("closed before open")
    Socket.latest.close()
    await assertion
  })
  it("When an in-flight command times out Then no mutation can be mechanically replayed", async () => {
    vi.useFakeTimers()
    const socket = new Socket(),
      cdp = new Cdp(socket)
    const call = cdp.call("Runtime.evaluate", { expression: "mutate()" })
    const assertion = expect(call).rejects.toThrow("effects indeterminate")
    await vi.advanceTimersByTimeAsync(120001)
    await assertion
    await expect(cdp.call("Runtime.evaluate", { expression: "mutate()" })).rejects.toThrow(
      "cannot replay",
    )
    expect(socket.sent).toHaveLength(1)
  })
  it("When the target disconnects Then all pending calls fail", async () => {
    const socket = new Socket(),
      cdp = new Cdp(socket)
    const first = expect(cdp.call("Runtime.evaluate")).rejects.toThrow("indeterminate")
    socket.close()
    await first
    await expect(cdp.call("Runtime.evaluate")).rejects.toThrow()
  })
})
