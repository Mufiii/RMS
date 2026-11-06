/**
 * A business-rule failure the user should see. `code` is a translation key
 * under `errors.*` in messages/{en,ml}.json; `params` fill its placeholders.
 * Raw database errors are never shown to users.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly params: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = "DomainError";
  }
}

export class ForbiddenError extends DomainError {
  constructor() {
    super("forbidden");
    this.name = "ForbiddenError";
  }
}
