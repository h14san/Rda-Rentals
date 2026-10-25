/**
 * Pulls the message out of a failed Edge Function call.
 *
 * supabase-js surfaces a non-2xx response as an error whose body has not been
 * read yet, so the useful text is behind `context`. Without this every failure
 * reads "Edge Function returned a non-2xx status code", which tells the user
 * nothing about whether to retry, rephrase, or give up — and both AI features
 * depend on that distinction, since "out of free quota" and "rephrase it" need
 * opposite responses from the user.
 */
export async function messageFromFunctionError(
  error: unknown,
  fallback: string,
): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // Fall through: a body that is not JSON carries nothing worth showing.
    }
  }
  return error instanceof Error ? error.message : fallback;
}
