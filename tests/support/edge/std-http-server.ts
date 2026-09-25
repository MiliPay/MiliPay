/**
 * Stand-in for https://deno.land/std/http/server.ts under Node.
 *
 * An Edge Function calls serve(handler) at import time. Here that just hands
 * the handler to the test, which then calls it with real Request objects —
 * the function's own code runs unchanged.
 */
export function serve(handler: (req: Request) => Response | Promise<Response>): void {
  (globalThis as { __edgeHandler?: typeof handler }).__edgeHandler = handler;
}
