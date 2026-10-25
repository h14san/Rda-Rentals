// Shared plumbing for the Gemini-backed Edge Functions (smart-search,
// auto-describe).
//
// Both functions exist for the same reason — they hold GEMINI_API_KEY, which can
// never ship inside a React Native bundle — so they need the same key handling,
// the same CORS preamble, and the same translation of provider failures into
// something the app can show a landlord. Duplicating that was already drifting
// between two copies; a third would have guaranteed it.
//
// Editing this file means BOTH functions must be redeployed:
//   npx supabase functions deploy smart-search
//   npx supabase functions deploy auto-describe

/**
 * Free-tier default. Override with the GEMINI_MODEL secret without a redeploy.
 *
 * Google retires model names for new API keys — gemini-2.5-flash was already
 * refused ("no longer available to new users") on a key issued in 2026. If a
 * function starts returning 404, the model name is the thing to change, not the
 * code.
 */
const DEFAULT_MODEL = 'gemini-3.6-flash';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export function modelName(): string {
  return Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
}

/**
 * Turns a provider failure into a short, actionable message.
 *
 * `feature` is the user-facing name of the caller ("Smart search",
 * "Auto-describe"), because a landlord reading "unavailable right now" needs to
 * know which thing is unavailable.
 *
 * The SDK surfaces HTTP failures as messages rather than typed classes, so
 * these are matched on status text. The raw message is deliberately never
 * returned: provider errors are verbose and can echo request internals. It goes
 * to the function logs instead.
 */
export function providerErrorResponse(error: unknown, feature: string): Response {
  const message = error instanceof Error ? error.message : String(error);

  if (/API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) {
    return json({ error: `${feature} is misconfigured (bad API key).` }, 503);
  }
  if (/NOT_FOUND|no longer available|is not found/i.test(message)) {
    return json(
      { error: `${feature} is pointed at a model that no longer exists.` },
      503,
    );
  }
  if (/RESOURCE_EXHAUSTED|quota|429/i.test(message)) {
    return json(
      { error: `${feature} has hit its free-tier limit. Try again later.` },
      429,
    );
  }

  console.error(`${feature} failed`, message);
  return json({ error: `${feature} is unavailable right now.` }, 502);
}
