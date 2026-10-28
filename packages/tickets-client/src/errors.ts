// What a caller needs to decide: retry later, tell the person it does not exist,
// explain a conflict (with its code), or fix the request.
export type TicketServiceErrorKind = "unavailable" | "not_found" | "conflict" | "invalid_request";

export class TicketServiceError extends Error {
  constructor(
    readonly kind: TicketServiceErrorKind,
    readonly code: string,
    readonly status?: number,
  ) {
    super(`Ticket service error: ${kind} (${code})`);
    this.name = "TicketServiceError";
  }
}

export function errorForStatus(status: number, code: string): TicketServiceError {
  if (status === 404) return new TicketServiceError("not_found", code, status);
  if (status === 409) return new TicketServiceError("conflict", code, status);
  return new TicketServiceError("invalid_request", code, status);
}
