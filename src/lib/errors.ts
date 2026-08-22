export function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    const inner = err.errors.map(describeError).filter(Boolean);
    const unique = [...new Set(inner)];
    return err.message || unique.join("; ") || "aggregate error with no detail";
  }

  if (err instanceof Error) {
    const cause = err.cause ? ` (cause: ${describeError(err.cause)})` : "";
    const code = (err as NodeJS.ErrnoException).code;
    const base = err.message || code || err.name || "error with no message";
    return `${base}${cause}`;
  }

  if (typeof err === "string") return err;
  return String(err ?? "unknown error");
}
