export class AnythingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AnythingError";
  }
}

export class HttpError extends AnythingError {
  constructor(public readonly status: number, public readonly body: unknown, command: string) {
    super(`Command ${command} failed with HTTP ${status}`, "HTTP_ERROR", { status, body, command });
  }
}

export class GraphqlError extends AnythingError {
  constructor(public readonly errors: unknown[], command: string) {
    super(`GraphQL command ${command} returned errors`, "GRAPHQL_ERROR", { errors, command });
  }
}

export class ResponseValidationError extends AnythingError {
  constructor(command: string, errors: unknown) {
    super(`Response schema mismatch for ${command}`, "RESPONSE_SCHEMA_MISMATCH", { command, errors });
  }
}
