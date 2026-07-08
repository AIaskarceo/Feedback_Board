// Clerk's frontend SDK throws errors shaped like { errors: [{ message, longMessage }] }
// rather than a plain Error — this pulls a displayable string out of either shape.
export function clerkErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'errors' in err) {
    const errors = (err as { errors?: Array<{ longMessage?: string; message?: string }> }).errors;
    const first = errors?.[0];
    if (first?.longMessage) return first.longMessage;
    if (first?.message) return first.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
