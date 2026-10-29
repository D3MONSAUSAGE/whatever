import type { Instrumentation } from "next";

/**
 * Error monitoring without a paid service: every unhandled server error becomes one
 * JSON line in the Vercel runtime logs, easy to filter with `level:error`.
 * Never log headers, cookies, query strings or bodies; they can hold tokens.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(JSON.stringify({
    level: "error",
    event: "request_error",
    method: request.method,
    path: request.path.split("?")[0],
    routeType: context.routeType,
    routePath: context.routePath,
    digest: err.digest ?? null,
    name: err.name,
    message: String(err.message ?? "").slice(0, 300),
    at: new Date().toISOString(),
  }));
};
