// What the API writes to its log when something fails (stage 11 PRD, S-11.11). A database
// error from Drizzle carries the query and its parameters in its message, and the parameters
// are people's messages, ids and session hashes; the log keeps only what went wrong.

type QueryError = Error & { query: string; params: unknown; cause?: unknown };

function isQueryError(error: unknown): error is QueryError {
  return error instanceof Error && "query" in error && "params" in error;
}

export function describeError(error: unknown): string {
  if (isQueryError(error)) {
    const cause = error.cause instanceof Error ? error.cause.message : "the query failed";
    return `${error.name}: ${cause}`;
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function logError(what: string, error: unknown) {
  console.error(what, describeError(error));
}
