// Smart search — turns a plain-language rental query into structured filters.
//
// Runs as a Supabase Edge Function for one reason: it holds the model API key.
// Anything bundled into a React Native app is extractable, so the key can never
// live client-side. The app sends text, this returns filters, and the app runs
// its normal listings query with them.
//
// Deploy:  npx supabase functions deploy smart-search
// Secret:  npx supabase secrets set GEMINI_API_KEY=...
//
// Provider: Google Gemini, on the free Google AI Studio tier.

import { GoogleGenAI, Type } from 'npm:@google/genai@2.21.0';

/**
 * Free-tier default. Override with the GEMINI_MODEL secret without a redeploy.
 *
 * Google retires model names for new API keys — gemini-2.5-flash was already
 * refused ("no longer available to new users") on a key issued in 2026. If this
 * starts returning 404, the model name is the thing to change, not the code.
 */
const DEFAULT_MODEL = 'gemini-3.6-flash';

const PROPERTY_TYPES = ['studio', 'apartment', 'shared', 'house'] as const;

/**
 * Sentinels instead of nulls.
 *
 * Gemini's response schema supports `nullable`, but combining it with `enum`
 * and required fields is where structured output gets flaky across models. It
 * is more robust to demand every field, use an out-of-band value for "not
 * specified", and convert to null here. Note -1 for bedrooms: 0 is a *real*
 * value meaning studio, so it cannot double as the sentinel.
 */
const UNSET_NUMBER = 0;
const UNSET_BEDROOMS = -1;
const UNSET_TYPE = 'any';

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    minPrice: { type: Type.INTEGER, description: 'Minimum monthly rent in RWF, or 0 if not specified.' },
    maxPrice: { type: Type.INTEGER, description: 'Maximum monthly rent in RWF, or 0 if not specified.' },
    district: { type: Type.STRING, description: 'Exact district name from the allowed list, or empty string.' },
    sector: { type: Type.STRING, description: 'Exact sector name from the allowed list, or empty string.' },
    propertyType: { type: Type.STRING, enum: [UNSET_TYPE, ...PROPERTY_TYPES] },
    minBedrooms: { type: Type.INTEGER, description: 'Minimum bedrooms; 0 means studio, -1 if not specified.' },
    furnishedOnly: { type: Type.BOOLEAN },
    interpretation: { type: Type.STRING, description: 'One short sentence for the renter describing what was filtered on.' },
    unclear: { type: Type.BOOLEAN, description: 'True only if the text contains no rental criteria at all.' },
  },
  required: [
    'minPrice', 'maxPrice', 'district', 'sector', 'propertyType',
    'minBedrooms', 'furnishedOnly', 'interpretation', 'unclear',
  ],
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function systemPrompt(districts: string[], sectors: string[]): string {
  return [
    "You convert a renter's plain-language request into search filters for a",
    'rental marketplace in Kigali, Rwanda. Prices are Rwandan francs (RWF).',
    '',
    'Rules:',
    '- Only fill a field the user actually implied. Use the "not specified"',
    '  value for everything else: 0 for prices, "" for district and sector,',
    `  "${UNSET_TYPE}" for propertyType, -1 for minBedrooms.`,
    '- Never invent a location. district must be one of: ' + districts.join(', ') + '.',
    '- sector must be one of: ' + sectors.join(', ') + '.',
    '- If a place is named that is not in those lists, leave both empty and say',
    '  so in the interpretation rather than guessing a nearby sector.',
    '- "studio" sets propertyType to studio, not minBedrooms 0.',
    '- Vague budget words map to ranges a Kigali renter would expect:',
    '  "cheap"/"affordable"/"budget" -> maxPrice 150000;',
    '  "mid-range" -> minPrice 150000 and maxPrice 400000;',
    '  "luxury"/"executive" -> minPrice 500000.',
    '- "under X" sets maxPrice X. "from X"/"at least X" sets minPrice X.',
    '- Handle typos and local spellings ("apratment" -> apartment,',
    '  "Kimirongo" -> Kimironko).',
    '- Treat a bare number above 20000 as a monthly budget ceiling.',
    '- Set unclear true only when there are no rental criteria at all.',
    '',
    'interpretation is one short sentence in plain English addressed to the',
    'renter, describing only what you actually filtered on. No preamble.',
  ].join('\n');
}

interface ModelOutput {
  minPrice: number;
  maxPrice: number;
  district: string;
  sector: string;
  propertyType: string;
  minBedrooms: number;
  furnishedOnly: boolean;
  interpretation: string;
  unclear: boolean;
}

/**
 * Converts sentinels to nulls and drops anything outside the allowed
 * vocabulary. The prompt tells the model not to invent places; this makes it
 * true regardless of whether it complied.
 */
function toFilters(out: ModelOutput, districts: string[], sectors: string[]) {
  const positive = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) && n > UNSET_NUMBER
      ? Math.round(n)
      : null;

  const inList = (value: string, list: string[]) =>
    list.find((v) => v.toLowerCase() === value.trim().toLowerCase()) ?? null;

  return {
    minPrice: positive(out.minPrice),
    maxPrice: positive(out.maxPrice),
    district: out.district ? inList(out.district, districts) : null,
    sector: out.sector ? inList(out.sector, sectors) : null,
    propertyType:
      out.propertyType && out.propertyType !== UNSET_TYPE &&
      (PROPERTY_TYPES as readonly string[]).includes(out.propertyType)
        ? out.propertyType
        : null,
    minBedrooms:
      typeof out.minBedrooms === 'number' && out.minBedrooms > UNSET_BEDROOMS
        ? Math.round(out.minBedrooms)
        : null,
    furnishedOnly: out.furnishedOnly === true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    // A clear, actionable message beats a 500 the app cannot explain.
    return json(
      { error: 'Smart search is not configured yet (GEMINI_API_KEY is unset).' },
      503,
    );
  }

  let body: { query?: unknown; districts?: unknown; sectors?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return json({ error: 'Enter something to search for.' }, 400);
  // Long input is almost always a paste, and it only inflates token cost.
  if (query.length > 300) return json({ error: 'That search is too long.' }, 400);

  const asStrings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const districts = asStrings(body.districts);
  const sectors = asStrings(body.sectors);

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL,
      contents: query,
      config: {
        systemInstruction: systemPrompt(districts, sectors),
        responseMimeType: 'application/json',
        responseSchema,
        // Filter extraction has one right answer; sampling variety only makes
        // the same query return different results on a retry.
        temperature: 0,
      },
    });

    const text = response.text;
    if (!text) return json({ error: 'Could not understand that search.' }, 422);

    let parsed: ModelOutput;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('smart-search: model returned non-JSON', text.slice(0, 200));
      return json({ error: 'Could not understand that search.' }, 422);
    }

    return json({
      filters: toFilters(parsed, districts, sectors),
      interpretation:
        typeof parsed.interpretation === 'string' ? parsed.interpretation : '',
      unclear: parsed.unclear === true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // The SDK surfaces HTTP failures as messages rather than typed classes, so
    // these are matched on status text to give the user something actionable.
    if (/API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) {
      return json({ error: 'Smart search is misconfigured (bad API key).' }, 503);
    }
    if (/NOT_FOUND|no longer available|is not found/i.test(message)) {
      return json(
        { error: 'Smart search is pointed at a model that no longer exists.' },
        503,
      );
    }
    if (/RESOURCE_EXHAUSTED|quota|429/i.test(message)) {
      return json(
        { error: 'Smart search has hit its free-tier limit. Try again later.' },
        429,
      );
    }

    console.error('smart-search failed', message);
    // Deliberately not returned to the client: provider errors are verbose and
    // can echo request internals. The message is in the function logs instead.
    return json({ error: 'Smart search is unavailable right now.' }, 502);
  }
});
