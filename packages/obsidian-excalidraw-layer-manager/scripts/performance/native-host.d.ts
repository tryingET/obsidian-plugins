interface SocketLike extends EventTarget {
  send(value: string): void
  close(): void
}
export class Cdp {
  constructor(socket: SocketLike)
  static connect(
    url: string,
    timeout?: number,
    Socket?: new (url: string) => SocketLike,
  ): Promise<Cdp>
  call(method: string, params?: Record<string, unknown>): Promise<unknown>
  evaluate(expression: string): Promise<unknown>
  close(): void
}
// Conservative boundary for injected launch-failure tests; returned browser APIs remain opaque.
export function launchHost(output: string, executable: string): Promise<unknown>
