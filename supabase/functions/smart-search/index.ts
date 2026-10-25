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

import {
  FILTER_FIELDS,
  filterRules,
  filterSchemaProperties,
  toFilters,
  type FilterOutput,
} from '../_shared/filters.ts';
import { CORS, json, modelName, providerErrorResponse } from '../_shared/gemini.ts';

const FEATURE = 'Smart search';

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    ...filterSchemaProperties,
    interpretation: {
      type: Type.STRING,
      description:
        'One short sentence for the renter describing what was filtered on.',
    },
    unclear: {
      type: Type.BOOLEAN,
      description: 'True only if the text contains no rental criteria at all.',
    },
  },
  required: [...FILTER_FIELDS, 'interpretation', 'unclear'],
};

function systemPrompt(districts: string[], sectors: string[]): string {
  return [
    "You convert a renter's plain-language request into search filters for a",
    'rental marketplace in Kigali, Rwanda. Prices are Rwandan francs (RWF).',
    '',
    'Rules:',
    ...filterRules(districts, sectors),
    '- Set unclear true only when there are no rental criteria at all.',
    '',
    'interpretation is one short sentence in plain English addressed to the',
    'renter, describing only what you actually filtered on. No preamble.',
  ].join('\n');
}

interface ModelOutput extends FilterOutput {
  interpretation: string;
  unclear: boolean;
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
      model: modelName(),
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
    return providerErrorResponse(error, FEATURE);
  }
});
