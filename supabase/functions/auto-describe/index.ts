// Auto-describe — turns a landlord's photos into a listing description.
//
// Runs as an Edge Function for the same reason as smart-search: it holds the
// model API key, and anything bundled into a React Native app is extractable.
//
// Deploy:  npx supabase functions deploy auto-describe
// Secret:  npx supabase secrets set GEMINI_API_KEY=...   (shared, project-wide)
//
// Provider: Google Gemini, on the free Google AI Studio tier.

import { GoogleGenAI, Type } from 'npm:@google/genai@2.21.0';

import { CORS, json, modelName, providerErrorResponse } from '../_shared/gemini.ts';

const FEATURE = 'Auto-describe';

/**
 * The brief asks for 3-5 photos; this is the ceiling, not the requirement.
 *
 * Every extra photo is upload cost on a Rwandan mobile connection and tokens on
 * a free tier, and the sixth picture of the same sitting room adds nothing the
 * model did not already have.
 */
const MAX_IMAGES = 5;

/**
 * Per-image and total payload ceilings, in base64 characters.
 *
 * The app downscales before sending (see compressForAnalysis), so hitting these
 * means something is wrong rather than a large house. Rejecting here gives a
 * message the landlord can act on instead of an opaque provider 400.
 */
const MAX_IMAGE_CHARS = 900_000; // ~675 KB of JPEG
const MAX_TOTAL_CHARS = 2_600_000; // ~1.9 MB across all images

/** Cap on the generated text. Enforced again in the app. */
const MAX_DESCRIPTION_CHARS = 1_000;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    description: {
      type: Type.STRING,
      description:
        'The listing description, 50-90 words of plain prose. Empty string if the photos are unusable.',
    },
    unusable: {
      type: Type.BOOLEAN,
      description:
        'True only if the photos do not show a property that could be rented out.',
    },
  },
  required: ['description', 'unusable'],
};

/** What the landlord has already typed. Ground truth — never contradicted. */
interface Facts {
  title?: unknown;
  propertyType?: unknown;
  bedrooms?: unknown;
  furnished?: unknown;
  district?: unknown;
  sector?: unknown;
}

/**
 * The facts are stated to the model so the prose agrees with the structured
 * fields, and so it never has to guess at a number it cannot see.
 *
 * Price is deliberately not among them: it is displayed as its own field on
 * every card and on the detail page, and prose that repeats it goes stale the
 * first time a landlord edits the rent — leaving a listing that contradicts
 * itself with no warning.
 */
function factLines(facts: Facts): string[] {
  const lines: string[] = [];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const title = str(facts.title);
  const type = str(facts.propertyType);
  const place = [str(facts.sector), str(facts.district)].filter(Boolean).join(', ');

  if (title) lines.push(`- The landlord titled it: "${title.slice(0, 120)}"`);
  if (type) lines.push(`- Property type: ${type}`);
  if (typeof facts.bedrooms === 'number' && Number.isFinite(facts.bedrooms)) {
    lines.push(
      facts.bedrooms === 0
        ? '- It is a studio (one room)'
        : `- Bedrooms: ${Math.round(facts.bedrooms)}`,
    );
  }
  if (typeof facts.furnished === 'boolean') {
    lines.push(facts.furnished ? '- It is furnished' : '- It is unfurnished');
  }
  if (place) lines.push(`- Location: ${place}, Kigali`);

  return lines;
}

function systemPrompt(facts: Facts): string {
  const known = factLines(facts);

  return [
    'You write rental listing descriptions for a marketplace in Kigali,',
    'Rwanda. The landlord has photographed the property and will read, edit and',
    'publish what you write, so it must be accurate and easy to correct.',
    '',
    'Write 50-90 words of plain prose, in one or two short paragraphs.',
    '',
    'Rules:',
    '- Describe only what is visible in the photos, plus the facts listed below.',
    '- Never state a fact you cannot see: no floor area, no rent, no distance to',
    '  a landmark, no utilities, no security or water supply claims, no',
    '  neighbours, no transport links. A tenant who arrives and finds these',
    '  untrue is the exact problem this app exists to fix.',
    '- Do not mention the rent or any price, even if you could infer one.',
    '- Do not describe or mention any people, pets or number plates in the',
    '  photos. If the photos are mostly of people, set unusable to true.',
    '- Concrete visible detail is the whole value here: tiled floors, built-in',
    '  wardrobes, a walled compound, a finished kitchen, large windows, a',
    '  veranda, parking space. Name what is actually there.',
    '- Sober Rwandan English. No sales hype (stunning, dream home, nestled), no',
    '  emoji, no markdown, no headings, no bullet lists, no invented address, no',
    '  closing call to action.',
    '- If the photos are blurry, too few, or clearly not of a rentable property,',
    '  set unusable to true and leave description empty.',
    '',
    known.length > 0
      ? [
          'Facts the landlord has already entered — treat these as true:',
          ...known,
        ].join('\n')
      : 'The landlord has not entered any details yet. Work from the photos alone.',
  ].join('\n');
}

interface ModelOutput {
  description: string;
  unusable: boolean;
}

/**
 * Strips the formatting the prompt asked it not to use.
 *
 * Cheaper and more reliable than another round trip: markdown emphasis and
 * stray bullets render as literal asterisks in a React Native Text node, and
 * the landlord would have to delete them by hand.
 */
function cleanDescription(raw: string): string {
  return raw
    .replace(/[*_#`]+/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_DESCRIPTION_CHARS);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return json(
      { error: 'Auto-describe is not configured yet (GEMINI_API_KEY is unset).' },
      503,
    );
  }

  let body: { images?: unknown; facts?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const images = Array.isArray(body.images)
    ? body.images.filter((i): i is string => typeof i === 'string' && i.length > 0)
    : [];

  if (images.length === 0) return json({ error: 'Add at least one photo first.' }, 400);
  if (images.length > MAX_IMAGES) {
    return json({ error: `Send at most ${MAX_IMAGES} photos.` }, 400);
  }

  let total = 0;
  for (const image of images) {
    total += image.length;
    if (image.length > MAX_IMAGE_CHARS || total > MAX_TOTAL_CHARS) {
      return json({ error: 'Those photos are too large to read.' }, 413);
    }
    // Rejecting a non-base64 payload here keeps a client bug from arriving as an
    // unexplained provider 400.
    if (!/^[A-Za-z0-9+/=\s]+$/.test(image)) {
      return json({ error: 'Those photos could not be read.' }, 400);
    }
  }

  const facts: Facts =
    body.facts && typeof body.facts === 'object' ? (body.facts as Facts) : {};

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: modelName(),
      contents: [
        {
          role: 'user',
          parts: [
            ...images.map((data) => ({
              inlineData: { mimeType: 'image/jpeg', data },
            })),
            { text: 'Write the description for this property.' },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt(facts),
        responseMimeType: 'application/json',
        responseSchema,
        // Unlike smart-search (temperature 0, one right answer) this is prose: a
        // landlord who does not like the wording will press the button again,
        // and at 0 they would get the same paragraph back and conclude it is
        // broken. Low enough that it stays sober and factual.
        temperature: 0.6,
      },
    });

    const text = response.text;
    if (!text) return json({ error: 'Could not read those photos.' }, 422);

    let parsed: ModelOutput;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('auto-describe: model returned non-JSON', text.slice(0, 200));
      return json({ error: 'Could not read those photos.' }, 422);
    }

    const description =
      typeof parsed.description === 'string'
        ? cleanDescription(parsed.description)
        : '';

    // An empty description with unusable false is a model failure rather than a
    // photo problem, but both reach the app as "nothing usable came back" so it
    // can say so once instead of rendering a blank field as success.
    return json({
      description,
      unusable: parsed.unusable === true || description.length === 0,
    });
  } catch (error) {
    return providerErrorResponse(error, FEATURE);
  }
});
