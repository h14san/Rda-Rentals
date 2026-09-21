// Chat — the conversational front end to the same listings query.
//
// The brief calls this an assistant that "reads the live database". It does not,
// and that is the design: the model receives the conversation and returns a
// reply plus a Filters object, and the APP runs its ordinary feed query and
// renders the real matching listings under the reply.
//
// A model that never sees a listing row cannot invent a property, quote a rent
// that does not exist, or promise something is still available — the three
// failures that would make an AI housing assistant worse than the WhatsApp
// groups this app replaces. It also means every answer is reproducible as a
// normal filter the renter can inspect and edit by hand.
//
// Deploy:  npx supabase functions deploy chat
// Secret:  npx supabase secrets set GEMINI_API_KEY=...   (shared, project-wide)

import { GoogleGenAI, Type } from 'npm:@google/genai@2.21.0';

import {
  FILTER_FIELDS,
  filterRules,
  filterSchemaProperties,
  toFilters,
  type FilterOutput,
} from '../_shared/filters.ts';
import { CORS, json, modelName, providerErrorResponse } from '../_shared/gemini.ts';

const FEATURE = 'The assistant';

/**
 * Turns of history sent with each request.
 *
 * Enough for the refinement the feature exists for ("...actually make it
 * furnished"), short enough that a long session does not grow the token cost of
 * every subsequent turn on a free tier.
 */
const MAX_HISTORY = 8;
const MAX_MESSAGE_CHARS = 400;

/** Sentinel, for the same reason the filter fields have them. */
const UNSET_SORT = 'unset';
const SORT_ORDERS = ['newest', 'price_asc', 'price_desc'] as const;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    ...filterSchemaProperties,
    reply: {
      type: Type.STRING,
      description:
        'One or two short sentences to the renter. Never mentions specific listings, counts or prices you were not given.',
    },
    search: {
      type: Type.BOOLEAN,
      description:
        'True when the filters should be applied and listings shown. False while still asking what they need.',
    },
    sort: {
      type: Type.STRING,
      enum: [UNSET_SORT, ...SORT_ORDERS],
      description:
        'Ordering the renter asked for; "unset" to keep the current ordering.',
    },
  },
  required: [...FILTER_FIELDS, 'reply', 'search', 'sort'],
};

interface ModelOutput extends FilterOutput {
  reply: string;
  search: boolean;
  sort: string;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * Describes the filters already in force, so a follow-up refines instead of
 * restarting.
 *
 * Sent as prose rather than JSON: the model has to return the *complete* filter
 * set every turn, and stating the current state in the same language it answers
 * in makes "under 200,000" keep the sector it already had.
 */
function currentStateLine(filters: Partial<FilterOutput> | null, sort: string): string {
  if (!filters) return 'No filters are applied yet.';

  const parts: string[] = [];
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const min = num(filters.minPrice);
  const max = num(filters.maxPrice);
  if (min && max) parts.push(`price between ${min} and ${max} RWF`);
  else if (max) parts.push(`under ${max} RWF`);
  else if (min) parts.push(`from ${min} RWF`);

  const sector = str(filters.sector);
  const district = str(filters.district);
  if (sector) parts.push(`in ${sector}`);
  else if (district) parts.push(`in ${district} district`);

  const type = str(filters.propertyType);
  if (type) parts.push(`type ${type}`);

  if (typeof filters.minBedrooms === 'number' && filters.minBedrooms >= 0) {
    parts.push(
      filters.minBedrooms === 0
        ? 'studio-sized'
        : `at least ${filters.minBedrooms} bedrooms`,
    );
  }
  if (filters.furnishedOnly === true) parts.push('furnished only');

  const ordering =
    sort === 'price_asc'
      ? ', sorted cheapest first'
      : sort === 'price_desc'
        ? ', sorted most expensive first'
        : '';

  return parts.length > 0
    ? `Filters currently applied: ${parts.join(', ')}${ordering}.`
    : 'No filters are applied yet.';
}

function systemPrompt(
  districts: string[],
  sectors: string[],
  filters: Partial<FilterOutput> | null,
  sort: string,
): string {
  return [
    'You are the housing assistant inside Rwanda Rentals, a rental marketplace',
    'for Kigali. A renter talks to you the way they would to a friend who knows',
    'the city, and you turn that into a search. Prices are Rwandan francs (RWF).',
    '',
    'You never see the listings. The app runs the search you describe and shows',
    'the real matching rentals directly under your reply. So:',
    '- Never say how many rentals there are, or that there are none.',
    '- Never describe, name, price or promise a specific property, landlord or',
    '  address. You have not seen one. The cards under your reply are the',
    '  answer; your job is only to have understood the question.',
    '- Never claim something is available, verified or a good deal.',
    '',
    'Return the complete filter set you want applied every turn, not just what',
    'changed. The filters already in force are stated below — keep them unless',
    'the renter changes or drops them. If they ask to start over, return all',
    'fields unset.',
    '',
    'Filter rules:',
    ...filterRules(districts, sectors),
    '',
    'Set search true once you have at least one filter worth applying. Set it',
    'false only while you still have nothing to search on — then ask ONE short',
    'question, the most useful one, usually the area or the budget.',
    '',
    'Set sort when the renter asks for an ordering: "cheapest" or "lowest price"',
    `-> price_asc, "most expensive" -> price_desc, otherwise "${UNSET_SORT}".`,
    'Asking for the cheapest is a sort, not a filter — do not invent a maxPrice',
    'for it.',
    '',
    'reply is one or two short sentences of plain, warm English: confirm what',
    'you searched for, or ask the one question you need. No lists, no markdown,',
    'no emoji, no greeting boilerplate on every turn, no offers to do things',
    'this app cannot do (you cannot book, call, negotiate or email). If they ask',
    'for something the app does not have — a different city, buying rather than',
    'renting, a landmark you were not given — say so plainly in the reply and',
    'suggest the nearest thing you can search.',
    '',
    currentStateLine(filters, sort),
  ].join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return json(
      { error: 'The assistant is not configured yet (GEMINI_API_KEY is unset).' },
      503,
    );
  }

  let body: {
    messages?: unknown;
    filters?: unknown;
    sort?: unknown;
    districts?: unknown;
    sectors?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const turns: Turn[] = Array.isArray(body.messages)
    ? body.messages
        .filter(
          (m): m is Turn =>
            !!m &&
            typeof m === 'object' &&
            typeof (m as Turn).text === 'string' &&
            ((m as Turn).role === 'user' || (m as Turn).role === 'assistant'),
        )
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, text: m.text.trim().slice(0, MAX_MESSAGE_CHARS) }))
        .filter((m) => m.text.length > 0)
    : [];

  if (turns.length === 0) return json({ error: 'Say what you are looking for.' }, 400);
  if (turns[turns.length - 1].role !== 'user') {
    return json({ error: 'The last message must be from the renter.' }, 400);
  }

  const asStrings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const districts = asStrings(body.districts);
  const sectors = asStrings(body.sectors);

  const filters =
    body.filters && typeof body.filters === 'object'
      ? (body.filters as Partial<FilterOutput>)
      : null;
  const sort = typeof body.sort === 'string' ? body.sort : UNSET_SORT;

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: modelName(),
      // Gemini's own role names: 'model' rather than 'assistant'.
      contents: turns.map((t) => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: t.text }],
      })),
      config: {
        systemInstruction: systemPrompt(districts, sectors, filters, sort),
        responseMimeType: 'application/json',
        responseSchema,
        // Between smart-search's 0 and auto-describe's 0.6: the filters half
        // wants determinism, but a chat that answers "I need a place" with the
        // identical sentence every time reads like a phone tree.
        temperature: 0.3,
      },
    });

    const text = response.text;
    if (!text) return json({ error: 'The assistant could not answer that.' }, 422);

    let parsed: ModelOutput;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('chat: model returned non-JSON', text.slice(0, 200));
      return json({ error: 'The assistant could not answer that.' }, 422);
    }

    const nextFilters = toFilters(parsed, districts, sectors);
    const hasCriteria = Object.values(nextFilters).some(
      (v) => v !== null && v !== false,
    );

    return json({
      reply: typeof parsed.reply === 'string' ? parsed.reply.trim() : '',
      filters: nextFilters,
      // `search` is re-derived rather than trusted: a true with every field
      // unset would apply an empty filter and present the entire feed as though
      // it were an answer to the question.
      search: parsed.search === true && hasCriteria,
      sort:
        typeof parsed.sort === 'string' &&
        (SORT_ORDERS as readonly string[]).includes(parsed.sort)
          ? parsed.sort
          : null,
    });
  } catch (error) {
    return providerErrorResponse(error, FEATURE);
  }
});
