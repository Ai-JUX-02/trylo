/** One spelling of "what went wrong", for logs and failure messages. */
export function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
